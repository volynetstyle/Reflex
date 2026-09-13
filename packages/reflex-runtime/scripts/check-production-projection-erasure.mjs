import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

function javascript(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? javascript(path)
      : /\.(?:js|cjs)$/u.test(entry.name)
        ? [path]
        : [];
  });
}

const forbidden = [
  "projection.semantic.",
  "projection.raw.",
  "observeRuntimeProjection",
  "observeRuntimePropagate",
  "legacyCounterProjection",
];

for (const output of ["esm", "cjs"]) {
  for (const file of javascript(
    fileURLToPath(new URL(`../dist/${output}/`, import.meta.url)),
  )) {
    const source = readFileSync(file, "utf8");
    for (const marker of forbidden) {
      if (source.includes(marker)) {
        throw new Error(`Production projection leak: ${marker} in ${file}`);
      }
    }
  }
}

const development = javascript(
  fileURLToPath(new URL("../dist/dev/", import.meta.url)),
)
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");

if (!development.includes("projection.semantic.")) {
  throw new Error("Development build unexpectedly erased projections");
}

console.log("Production projection erasure passed.");
