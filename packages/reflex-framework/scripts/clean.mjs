import { readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const distDir = fileURLToPath(new URL("../dist", import.meta.url));
const srcDir = fileURLToPath(new URL("../src", import.meta.url));

const generatedSuffixes = [
  ".js",
  ".js.map",
  ".d.ts",
  ".d.ts.map",
];

function removeIfExists(path) {
  rmSync(path, { recursive: true, force: true });
}

function removeGeneratedArtifacts(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      removeGeneratedArtifacts(fullPath);
      continue;
    }

    if (generatedSuffixes.some((suffix) => entry.endsWith(suffix))) {
      rmSync(fullPath, { force: true });
    }
  }
}

removeIfExists(distDir);
removeGeneratedArtifacts(srcDir);
