import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { resolve, join, relative, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { packagesInScope, repoRoot, readPackage } from "../build/package-registry.mjs";
import { resolvePnpmCli } from "../build/pnpm.mjs";
import { verifyArchive } from "../build/verify-artifacts.mjs";

function options(argv) {
 const result={skipBuild:false,packOnly:false,outputDir:resolve(repoRoot,"artifacts/qualification"),keepFixture:false,offline:false};
 for(let i=0;i<argv.length;i++){const arg=argv[i];if(arg==="--")continue;if(arg==="--offline")result.offline=true;else if(arg==="--skip-build")result.skipBuild=true;else if(arg==="--pack-only")result.packOnly=true;else if(arg==="--keep-fixture")result.keepFixture=true;else if(arg==="--output-dir"){if(!argv[++i])throw new Error("--output-dir requires a path");result.outputDir=resolve(argv[i]);}else throw new Error("Unknown qualification argument: "+arg);}
 return result;
}
const config=options(process.argv.slice(2));
const runId=new Date().toISOString().replaceAll(":","-")+"-"+process.pid;
const output=join(config.outputDir,runId);
await mkdir(output,{recursive:true});
const summary={schemaVersion:1,kind:"release-qualification",runId,node:process.version,startedAt:new Date().toISOString(),status:"running",buildSkipped:config.skipBuild,packOnly:config.packOnly,packages:[],checks:[]};
const summaryPath=join(output,"qualification.json");
const save=()=>writeFile(summaryPath,JSON.stringify(summary,null,2)+"\n");
async function command(id,exe,args,cwd,env=process.env){
 const began=Date.now();const item={id,status:"running",durationMs:null,exitCode:null,logPath:id.replaceAll(":","_")+".log"};summary.checks.push(item);await save();
 const chunks=[];await new Promise((done,reject)=>{const child=spawn(exe,args,{cwd,env,windowsHide:true,stdio:["ignore","pipe","pipe"]});child.stdout.on("data",data=>chunks.push(data));child.stderr.on("data",data=>chunks.push(data));child.on("error",reject);child.on("close",code=>{item.exitCode=code;done();});}).catch(error=>{item.error=error.message;item.exitCode=-1;});
 const log=Buffer.concat(chunks);await writeFile(join(output,item.logPath),log);item.logSha256=createHash("sha256").update(log).digest("hex");item.durationMs=Date.now()-began;item.status=item.exitCode===0?"passed":"failed";await save();if(item.status!=="passed")throw new Error(id+" failed\n"+log.toString());console.log(id+": passed");return log.toString();
}
const fixture=await mkdtemp(join(tmpdir(),"reflex-qualified-"));
const fixtureTarget=resolve(fixture);const fixtureDistance=relative(resolve(tmpdir()),fixtureTarget);
if(!fixtureDistance||fixtureDistance.startsWith("..")||isAbsolute(fixtureDistance))throw new Error("Unsafe fixture path: "+fixtureTarget);
summary.fixture=fixture;await save();
try{
 const pnpm=await resolvePnpmCli();
 const packages=packagesInScope("publish");
 if(!config.skipBuild)await command("build.publish",process.execPath,[fileURLToPath(new URL("../build/run.mjs",import.meta.url)),"--scope","publish","build"],repoRoot);
 const tarballs=join(output,"tarballs");await mkdir(tarballs,{recursive:true});
 const dependencies={};
 for(const entry of packages){
  const packageDir=resolve(repoRoot,entry.path);const sourceManifest=await readPackage(entry);
  const previous=new Set(await readdir(tarballs));
  await command("pack."+sourceManifest.name.replaceAll("/","_"),process.execPath,[pnpm,"--config.ignore-scripts=true","pack","--pack-destination",tarballs],packageDir);
  const additions=(await readdir(tarballs)).filter(file=>file.endsWith(".tgz")&&!previous.has(file));
  if(additions.length!==1)throw new Error("Expected exactly one new archive for "+sourceManifest.name);
  const archive=join(tarballs,additions[0]);const verified=await verifyArchive(archive,{expectedName:sourceManifest.name});
  const bytes=await readFile(archive);dependencies[sourceManifest.name]="file:"+archive.replaceAll("\\","/");
  summary.packages.push({name:sourceManifest.name,version:sourceManifest.version,archive:relative(output,archive).replaceAll("\\","/"),sha256:createHash("sha256").update(bytes).digest("hex"),bytes:bytes.length,verification:verified});await save();
 }
 if(config.packOnly){summary.status="pack-only";summary.consumerQualification="not_run";}
 else{
  const toolVersion=async name=>JSON.parse(await readFile(join(repoRoot,"node_modules",name,"package.json"),"utf8")).version;
  const tools={vite:await toolVersion("vite"),jsdom:await toolVersion("jsdom"),"@swc/core":await toolVersion("@swc/core")};
  const overrides={};
  // Override concrete dependency edges only; global overrides rewrite peer ranges to file: in pnpm 9.
  for(const item of summary.packages)for(const dependency of Object.keys(item.verification.manifest.dependencies??{})){if(dependencies[dependency])overrides[item.name+">"+dependency]=dependencies[dependency];}
  await writeFile(join(fixture,"package.json"),JSON.stringify({name:"reflex-qualified-consumer",version:"0.0.0",private:true,type:"module",dependencies:{...dependencies,...tools},pnpm:{overrides}},null,2)+"\n");
  await command("consumer.install",process.execPath,[pnpm,"install",...(config.offline?["--offline"]:[]),"--ignore-scripts","--strict-peer-dependencies","--config.node-linker=isolated","--store-dir",resolve(repoRoot,".pnpm-store"),"--cache-dir",resolve(repoRoot,".cache/pnpm"),"--fetch-retries=0","--fetch-timeout=20000"],fixture);
  const consumerLock=await readFile(join(fixture,"pnpm-lock.yaml"));await writeFile(join(output,"consumer-lock.yaml"),consumerLock);summary.consumerLockSha256=createHash("sha256").update(consumerLock).digest("hex");await save();
  for(const file of ["identity.mjs","composition.mjs","ssr.mjs","types.mts","types.cts","browser.mjs","index.html","mcp-server.mjs","view.mjs"]){await writeFile(join(fixture,file),await readFile(new URL("./consumers/"+file,import.meta.url)));}
  for(const mode of ["esm","esm-development","cjs","cjs-development"]){await command("consumer.identity."+mode,process.execPath,[...(mode.endsWith("development")?["--conditions=development"]:[]),join(fixture,"identity.mjs"),mode],fixture);}
  for(const mode of ["production","development"]){await command("consumer.composition."+mode,process.execPath,[...(mode==="development"?["--conditions=development"]:[]),join(fixture,"composition.mjs")],fixture);}
  await command("consumer.ssr",process.execPath,[join(fixture,"ssr.mjs")],fixture);
  const standalone=await readFile(join(repoRoot,"packages/reflex-dom/scripts/standalone-consumer.tsx"),"utf8");
  await writeFile(join(fixture,"standalone.tsx"),standalone);
  await writeFile(join(fixture,"library.tsx"),standalone.replaceAll("@volynets/reflex-dom/standalone","@volynets/reflex-dom"));
  for(const module of ["NodeNext","ESNext"]){
   const compilerOptions={target:"ES2022",lib:["ES2022","DOM","DOM.Iterable","ESNext.Disposable"],module,moduleResolution:module==="NodeNext"?"NodeNext":"Bundler",strict:true,skipLibCheck:false,types:[],noEmit:true,jsx:"react-jsx",jsxImportSource:"@volynets/reflex-dom"};
   await writeFile(join(fixture,"tsconfig.json"),JSON.stringify({compilerOptions,files:["types.mts","library.tsx"]},null,2));
   await command("consumer.types."+module,process.execPath,[resolve(repoRoot,"node_modules/typescript/bin/tsc"),"-p",join(fixture,"tsconfig.json")],fixture);
   await writeFile(join(fixture,"tsconfig.json"),JSON.stringify({compilerOptions:{...compilerOptions,module:module==="ESNext"?"Preserve":module},files:["types.cts"]},null,2));
   await command("consumer.cjs-types."+module,process.execPath,[resolve(repoRoot,"node_modules/typescript/bin/tsc"),"-p",join(fixture,"tsconfig.json")],fixture);
   await writeFile(join(fixture,"tsconfig.json"),JSON.stringify({compilerOptions:{...compilerOptions,jsxImportSource:"@volynets/reflex-dom/standalone"},files:["standalone.tsx"]},null,2));
   await command("consumer.standalone-types."+module,process.execPath,[resolve(repoRoot,"node_modules/typescript/bin/tsc"),"-p",join(fixture,"tsconfig.json")],fixture);
  }
  await writeFile(join(fixture,"tsconfig.json"),JSON.stringify({compilerOptions:{target:"ES2022",lib:["ES2022","DOM","ESNext.Disposable"],module:"NodeNext",moduleResolution:"NodeNext",strict:true,skipLibCheck:false,types:[],noEmit:true},files:["types.mts","types.cts"]},null,2));
  await command("consumer.mixed-declarations",process.execPath,[resolve(repoRoot,"node_modules/typescript/bin/tsc"),"-p",join(fixture,"tsconfig.json")],fixture);
  await command("consumer.mcp.graph",process.execPath,[fileURLToPath(new URL("./run-mcp.mjs",import.meta.url)),fixture,"graph"],repoRoot);
  await command("consumer.mcp.bin",process.execPath,[fileURLToPath(new URL("./run-mcp.mjs",import.meta.url)),fixture,"bin"],repoRoot);
  await command("consumer.browser",process.execPath,[fileURLToPath(new URL("./run-browser.mjs",import.meta.url)),fixture,output],repoRoot);
  await command("consumer.active-divergences",process.execPath,[fileURLToPath(new URL("./check-active-divergences.mjs",import.meta.url))],repoRoot);
  summary.status="passed";summary.consumerQualification="passed";
 }
}catch(error){summary.status="failed";summary.error=error.stack??error.message;process.exitCode=1;console.error(error.message);}
finally{
 summary.completedAt=new Date().toISOString();await save();
 if(!config.keepFixture){await rm(fixtureTarget,{recursive:true,force:true});summary.fixtureRemoved=true;await save();}
 console.log("Qualification evidence: "+summaryPath);
}
