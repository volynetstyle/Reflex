import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import replace from "@rollup/plugin-replace";

export async function finalizeModules(directory, values) {
  const plugin = replace({ preventAssignment: true, values });
  const transform = typeof plugin.transform === "function" ? plugin.transform : plugin.transform.handler;
  async function visit(root) {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const file = join(root, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.name.endsWith(".js")) {
        const result = await transform.call({}, await readFile(file, "utf8"), file);
        if (result) await writeFile(file, result.code);
      }
    }
  }
  await visit(resolve(directory));
}
