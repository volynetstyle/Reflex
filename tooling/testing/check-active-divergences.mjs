import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import ts from "typescript";
export function checkActiveDivergences(source) {
 const ast=ts.createSourceFile("active.ts",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 assert.equal(ast.parseDiagnostics.length,0,"Active divergence catalog must parse.");
 let declaration;
 for(const statement of ast.statements)if(ts.isVariableStatement(statement))for(const item of statement.declarationList.declarations)if(ts.isIdentifier(item.name)&&item.name.text==="activeDivergences")declaration=item;
 assert(declaration?.initializer && ts.isArrayLiteralExpression(declaration.initializer),"Active catalog must be an explicit immutable array; computed catalogs cannot bypass qualification.");
 assert.equal(declaration.initializer.elements.length,0,"Release blocked: active semantic divergences remain.");
 return {id:"semantic.active-divergences",status:"passed",activeCount:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const source=await readFile(new URL("../../packages/reflex-runtime/test/differential/catalog/active.ts",import.meta.url),"utf8");
 console.log(JSON.stringify(checkActiveDivergences(source)));
}
