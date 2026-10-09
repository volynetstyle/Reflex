import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import * as dom from "@volynets/reflex-dom";
import * as framework from "@volynets/reflex-framework";
import { jsx } from "@volynets/reflex-dom/jsx-runtime";
import { createStoreCell } from "@volynets/reflex-store/runtime/internal";
import { createRuntime, effect } from "@volynets/reflex";
import { compileStore } from "@volynets/reflex-store/store";
import { asyncDerived, AsyncBlocker, AsyncDisposedError } from "@volynets/reflex-async";
assert.equal(dom.useComputed,framework.useComputed);assert.equal(dom.jsx,jsx);
const program='import {createStore,leaf} from "@volynets/reflex-store";export function make(){const state=createStore({a:0,b:0,items:leaf([]),get sum(){return this.a+this.b},update(){this.a=1;this.b=2}});return state;}';
await writeFile(new URL("./compiled.mjs",import.meta.url),compileStore(program,"consumer-store.js").code);
const {make}=await import("./compiled.mjs");
const runtime=createRuntime({effectStrategy:"eager"});const store=make();const seen=[];
const stop=effect(()=>{seen.push(store.sum);});store.update();assert.deepEqual(seen,[0,3]);stop();store.dispose();runtime.flush();
for(const effectStrategy of ["eager","sab","flush"]){
 const window=new JSDOM("<main></main>").window;
 try{
  const container=window.document.querySelector("main");
  const renderer=dom.createDOMRenderer({effectStrategy});
  const cell=createStoreCell(0);
  const dispose=renderer.render(jsx("p",{children:cell}),container);
  assert.equal(container.textContent,"0");renderer.batch(()=>cell.set(1));renderer.flush();assert.equal(container.textContent,"1");
  dispose();renderer.batch(()=>cell.set(2));renderer.flush();assert.equal(container.childNodes.length,0);cell.dispose();
  let settle;const deferred=asyncDerived(()=>new Promise(resolve=>{settle=resolve;}));
  assert.throws(()=>deferred.read(),AsyncBlocker);deferred.dispose();settle("obsolete");await Promise.resolve();await Promise.resolve();assert.throws(()=>deferred.read(),AsyncDisposedError);
 }finally{window.close();}
}
const standalone=await import("@volynets/reflex-dom/standalone");
const standaloneJSX=await import("@volynets/reflex-dom/standalone/jsx-runtime");
assert.equal(standalone.jsx,standaloneJSX.jsx);
assert.notEqual(standalone.useComputed,dom.useComputed,"Standalone must retain its independent execution graph.");
console.log("Installed Store/compiler/Async/Framework/DOM lifecycle composition passed.");
