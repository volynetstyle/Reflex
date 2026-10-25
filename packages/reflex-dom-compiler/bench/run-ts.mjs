// Runs a TypeScript entry by bundling it with esbuild (dependencies stay
// external). Usage: node bench/run-ts.mjs <entry.ts> [...args]
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [entry, ...args] = process.argv.slice(2);
const dir = mkdtempSync(join(resolve("node_modules"), ".run-ts-"));
const outfile = join(dir, "entry.mjs");
await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  logLevel: "error",
});
process.argv = [process.argv[0], entry, ...args];
try {
  await import(pathToFileURL(outfile).href);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
