import assert from "node:assert/strict";
import { test } from "node:test";
import { checkActiveDivergences } from "../check-active-divergences.mjs";
test("release rejects known divergences even if diagnostic replay would succeed",()=>{
 assert.equal(checkActiveDivergences("export const activeDivergences = [];").activeCount,0);
 assert.throws(()=>checkActiveDivergences('export const activeDivergences = [{id:"known-error"}];'),/active semantic divergences/);
 assert.throws(()=>checkActiveDivergences("export const activeDivergences = getCatalog();"),/explicit immutable array/);
});
