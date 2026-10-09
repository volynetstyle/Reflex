import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createServer } from "vite";
const [fixture,output]=process.argv.slice(2);
const domRequire=createRequire(new URL("../../packages/reflex-dom/package.json",import.meta.url));
const providerRequire=createRequire(domRequire.resolve("@vitest/browser-playwright"));
const {chromium}=providerRequire("playwright");
const installedPlugin=await import(pathToFileURL(join(fixture,"node_modules/@volynets/reflex-store/dist/vite.js")));
await writeFile(join(fixture,"browser-store.js"),'import {createStore,leaf} from "@volynets/reflex-store";export function make(){const state=createStore({a:0,b:0,items:leaf([]),get sum(){return this.a+this.b},update(){this.a=1;this.b=2}});return state;}');
const server=await createServer({configFile:false,root:fixture,mode:"production",resolve:{conditions:["production","browser","module"]},plugins:[installedPlugin.default()],cacheDir:join(fixture,".vite"),esbuild:{tsconfigRaw:{}},optimizeDeps:{noDiscovery:true,include:[]},server:{host:"127.0.0.1",port:0,fs:{allow:[fixture]}}});
let browser;const diagnostics={errors:[],console:[],requests:[],responses:[]};
try{
 await server.listen();browser=await chromium.launch({headless:true});const page=await browser.newPage();
 const pageErrors=diagnostics.errors;page.on("pageerror",error=>pageErrors.push(error.message));page.on("console",message=>{if(message.type()==="error")diagnostics.console.push(message.text());});page.on("requestfailed",request=>diagnostics.requests.push({url:request.url(),failure:request.failure()}));page.on("response",response=>{if(response.status()>=400)diagnostics.responses.push({url:response.url(),status:response.status()});});
 await page.goto(server.resolvedUrls.local[0]);await page.waitForFunction(()=>window.packedConsumerReady===true,undefined,{timeout:30000});
 assert.equal(await page.evaluate(()=>window.packedConsumer.click()),"count: 1");
 assert.equal(await page.evaluate(()=>window.packedConsumer.update()),"3");
 assert.equal(await page.evaluate(()=>window.packedConsumer.dispose()),0);
 assert.deepEqual(pageErrors,[]);await page.screenshot({path:join(output,"packed-consumer.png")});
 console.log("Chromium packed compiler, hydration, reactive update and disposal passed.");
}catch(error){console.error(JSON.stringify(diagnostics,null,2));await writeFile(join(output,"browser-diagnostics.json"),JSON.stringify(diagnostics,null,2)+"\n");if(browser){const page=(await browser.contexts()[0]?.pages())?.[0];if(page)await page.screenshot({path:join(output,"packed-consumer-failure.png")}).catch(()=>{});}throw error;}
finally{await browser?.close();await server.close();}
