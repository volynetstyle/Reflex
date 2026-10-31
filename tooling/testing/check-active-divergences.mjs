import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import ts from "typescript";
// A release requires an empty catalog. With `catalogued` (pull requests into
// dev) known divergences may remain: runtime.active-divergences.test.ts then
// requires each one to reproduce exactly and to be recognized by its evidence,
// and the differential suites reject any divergence outside the catalog.
export function checkActiveDivergences(source,{catalogued=false}={}){
 const ast=ts.createSourceFile("active.ts",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 assert.equal(ast.parseDiagnostics.length,0,"Active divergence catalog must parse.");
 let declaration;
 for(const statement of ast.statements)if(ts.isVariableStatement(statement))for(const item of statement.declarationList.declarations)if(ts.isIdentifier(item.name)&&item.name.text==="activeDivergences")declaration=item;
 assert(declaration?.initializer && ts.isArrayLiteralExpression(declaration.initializer),"Active catalog must be an explicit immutable array; computed catalogs cannot bypass qualification.");
 const activeCount=declaration.initializer.elements.length;
 if(!catalogued)assert.equal(activeCount,0,"Release blocked: active semantic divergences remain.");
 return {id:"semantic.active-divergences",status:activeCount===0?"passed":"catalogued",activeCount};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const source=await readFile(new URL("../../packages/reflex-runtime/test/differential/catalog/active.ts",import.meta.url),"utf8");
 const result=checkActiveDivergences(source,{catalogued:process.argv.includes("--catalogued")});
 if(result.status==="catalogued")console.log("::warning title=Active semantic divergences::"+result.activeCount+" catalogued divergence(s) remain (packages/reflex-runtime/test/differential/catalog/active.ts); releases stay blocked until the catalog is empty.");
 console.log(JSON.stringify(result));
}
