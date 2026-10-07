import { readdir, readFile, writeFile } from "node:fs/promises";
import replace from "@rollup/plugin-replace";

// Published modules must run without application-defined compiler globals.
const plugin = replace({
  preventAssignment: true,
  values: { __DEV__: "false" },
});
const transform =
  typeof plugin.transform === "function"
    ? plugin.transform
    : plugin.transform.handler;
async function finalize(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = new URL(entry.name, directory);
    if (entry.isDirectory()) {
      await finalize(new URL(entry.name + "/", directory));
    } else if (entry.name.endsWith(".js")) {
      const result = await transform.call(
        {},
        await readFile(file, "utf8"),
        file.href,
      );
      if (result) await writeFile(file, result.code);
    }
  }
}
await finalize(new URL("../dist/", import.meta.url));
