import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join, relative, dirname } from "node:path";
import ts from "typescript";

const packageRoot = resolve(process.argv[2] ?? ".");
const mode = process.argv[3];
if (!["runtime", "facade", "async"].includes(mode)) throw new Error("Expected CJS declaration mode: runtime, facade or async");
async function copyDeclaration(source, target) {
  // Keep declarations in a graph with CJS module identity and matching local extensions.
  const text = (await readFile(source, "utf8")).replace(/(["'])(\.[^"']+)\.d\.ts\1/g, "$1$2.d.cts$1").replace(/(["'])(\.[^"']+)\.js\1/g, "$1$2.cjs$1");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, text);
}
if (mode === "runtime") {
  const input = join(packageRoot, "dist/esm");
  const output = join(packageRoot, "dist/cjs/types");
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.name.endsWith(".d.ts")) await copyDeclaration(file, join(output, relative(input, file).replace(/\.d\.ts$/, ".d.cts")));
    }
  }
  await visit(input);
} else if (mode === "facade") {
  const esmFile=join(packageRoot,"dist/globals.d.ts");
  const original=await readFile(esmFile,"utf8");
  const ast=ts.createSourceFile(esmFile,original,ts.ScriptTarget.Latest,true);
  const ambient=ast.statements.find((node)=>ts.isModuleDeclaration(node)&&node.name.text==="global");
  if(!ambient&&!original.startsWith('/// <reference path="./global-types.d.ts" />'))throw new Error("Facade declarations must contain the global API contract.");
  if(ambient)await writeFile(join(packageRoot,"dist/global-types.d.ts"),ambient.getText(ast)+"\nexport {};\n");
  else await readFile(join(packageRoot,"dist/global-types.d.ts"),"utf8");
  const body=ambient?original.slice(ambient.end).trimStart():original.replace(/^\/\/\/ <reference path="\.\/global-types\.d\.ts" \/>\r?\n/,"");
  await writeFile(esmFile,'/// <reference path="./global-types.d.ts" />\n'+body);
  await mkdir(join(packageRoot,"dist/cjs"),{recursive:true});
  const cjsBody=body.replace(/(["'])(\.[^"']+)\.js\1/g,"$1$2.cjs$1");
  await writeFile(join(packageRoot,"dist/cjs/globals.d.cts"),'/// <reference path="../global-types.d.ts" />\n'+cjsBody);
  for (const subpath of ["debug", "unstable"]) await copyDeclaration(join(packageRoot, "dist", subpath, "index.d.ts"), join(packageRoot, "dist/cjs", subpath, "index.d.cts"));
} else {
  await copyDeclaration(join(packageRoot, "dist/index.d.ts"), join(packageRoot, "dist/cjs/index.d.cts"));
}
