import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const alienRoot = resolve(root, "node_modules/alien-signals/esm");
const outputRoot = resolve(root, "dist/instrumented");
let system = await readFile(resolve(alienRoot, "system.mjs"), "utf8");
let index = await readFile(resolve(alienRoot, "index.mjs"), "utf8");

system = system
  .replace(
    "export function createReactiveSystem",
    `export const instrumentation = { linksCreated: 0, linksReusedAtCursor: 0, linksReusedNext: 0, linksUnlinked: 0, traversalStackFrames: 0 };\nexport function resetInstrumentation() { for (const key of Object.keys(instrumentation)) instrumentation[key] = 0; }\nexport function createReactiveSystem`,
  )
  .replace("if (prevDep !== undefined && prevDep.dep === dep) {\n            return;", "if (prevDep !== undefined && prevDep.dep === dep) {\n            instrumentation.linksReusedAtCursor++;\n            return;")
  .replace("if (nextDep !== undefined && nextDep.dep === dep) {\n            nextDep.version", "if (nextDep !== undefined && nextDep.dep === dep) {\n            instrumentation.linksReusedNext++;\n            nextDep.version")
  .replace("const newLink = sub.depsTail", "instrumentation.linksCreated++;\n        const newLink = sub.depsTail")
  .replace("function unlink(link, sub = link.sub) {", "function unlink(link, sub = link.sub) {\n        instrumentation.linksUnlinked++;")
  .replaceAll("stack = { value:", "instrumentation.traversalStackFrames++;\n                        stack = { value:");

index = index
  .replace("'./system.mjs'", "'./alien-system.mjs'")
  .concat("\nexport { instrumentation, resetInstrumentation } from './alien-system.mjs';\n");

await mkdir(outputRoot, { recursive: true });
await writeFile(resolve(outputRoot, "alien-system.mjs"), system, "utf8");
await writeFile(resolve(outputRoot, "alien.mjs"), index, "utf8");
