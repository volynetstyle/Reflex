import { readFile, writeFile } from "node:fs/promises";

const declaration = new URL(
  "../dist/ownership/lifecycle.d.ts",
  import.meta.url,
);
const reference = '/// <reference lib="esnext.disposable" />\n';
const content = await readFile(declaration, "utf8");

if (!content.startsWith(reference)) {
  await writeFile(declaration, reference + content);
}
