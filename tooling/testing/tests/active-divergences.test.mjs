import assert from "node:assert/strict";
import { test } from "node:test";
import { checkActiveDivergences } from "../check-active-divergences.mjs";
test("release rejects known divergences even if diagnostic replay would succeed",()=>{
 assert.equal(checkActiveDivergences("export const activeDivergences = [];").activeCount,0);
 assert.throws(()=>checkActiveDivergences('export const activeDivergences = [{id:"known-error"}];'),/active semantic divergences/);
 assert.throws(()=>checkActiveDivergences("export const activeDivergences = getCatalog();"),/explicit immutable array/);
});
test("pull requests accept catalogued divergences but never a computed catalog",()=>{
 const result=checkActiveDivergences('export const activeDivergences = [{id:"F1-a"},{id:"F1-b"}];',{catalogued:true});
 assert.deepEqual([result.status,result.activeCount],["catalogued",2]);
 assert.equal(checkActiveDivergences("export const activeDivergences = [];",{catalogued:true}).status,"passed");
 assert.throws(()=>checkActiveDivergences("export const activeDivergences = getCatalog();",{catalogued:true}),/explicit immutable array/);
});
