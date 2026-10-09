import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {join} from "node:path";
const packageRequire=createRequire(new URL("../../packages/reflex-runtime-mcp/package.json",import.meta.url));
const {Client}=packageRequire("@modelcontextprotocol/client");
const {StdioClientTransport}=packageRequire("@modelcontextprotocol/client/stdio");
const [fixture,mode="graph"]=process.argv.slice(2);
const client=new Client({name:"reflex-packed-qualification",version:"1.0.0"});
const installedBin=join(fixture,"node_modules",".bin","reflex-runtime-mcp"+(process.platform==="win32"?".cmd":""));
const command=mode==="bin"?(process.platform==="win32"?"cmd.exe":installedBin):process.execPath;
const args=mode==="bin"?(process.platform==="win32"?["/d","/c",installedBin]:[]):["--conditions=development",join(fixture,"mcp-server.mjs")];
const transport=new StdioClientTransport({command,args,cwd:fixture,stderr:"pipe"});
try{
 await client.connect(transport);
 const {tools}=await client.listTools();assert(tools.some(item=>item.name==="graph.dump"));
 const first=await client.callTool({name:"statistics.summary",arguments:{}});
 assert.equal(first.isError,false);assert.equal(first.structuredContent.ok,true);
 if(mode==="graph"){
  assert(first.structuredContent.result.nodeCount>=3,"Diagnostics must observe the graph created through installed public APIs.");
  const one=await client.callTool({name:"graph.dump",arguments:{}});
  const two=await client.callTool({name:"graph.dump",arguments:{}});
  assert.equal(one.isError,false);assert.deepEqual(one.structuredContent,two.structuredContent,"Read-only graph tools must not mutate topology or versions.");
  let rejected=false;try{const result=await client.callTool({name:"graph.node",arguments:{id:-1}});rejected=result.isError===true;}catch(error){assert.match(error.message,/invalid|schema|greater|minimum|input/i);rejected=true;}
  assert(rejected,"Invalid graph id must be rejected by the protocol schema.");
  const second=await client.callTool({name:"statistics.summary",arguments:{}});
  assert.equal(second.structuredContent.result.nodeCount,first.structuredContent.result.nodeCount);
  assert.equal(second.structuredContent.result.edgeCount,first.structuredContent.result.edgeCount);
 }
 console.log("Installed MCP "+mode+" transport, schemas and read-only diagnostics passed.");
}finally{await client.close();}
