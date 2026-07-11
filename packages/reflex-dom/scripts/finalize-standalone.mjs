import { copyFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = new URL("../dist/", import.meta.url);
const bundle = new URL("../build/bundle/index.js", import.meta.url);
const declarations = new URL("../build/bundle/index.d.ts", import.meta.url);

async function removeJavaScript(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(fileURLToPath(directory), entry.name);
    if (entry.isDirectory()) {
      await removeJavaScript(new URL(`${entry.name}/`, directory));
    } else if (
      entry.name.endsWith(".js") ||
      entry.name.endsWith(".js.map") ||
      entry.name.endsWith(".d.ts") ||
      entry.name.endsWith(".d.ts.map")
    ) {
      await rm(path);
    }
  }
}

await removeJavaScript(dist);
await copyFile(bundle, new URL("index.js", dist));
await copyFile(declarations, new URL("index.d.ts", dist));
