// Builds the alien-signals reference adapter into a bench bundle directory
// (runtime.mjs + manifest.json) usable as `--candidate bundle:<dir>`.
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const packageRoot = path.resolve(import.meta.dirname, "../..");
const workspace = path.resolve(packageRoot, "../reflex/package.json");
const requireFromWorkspace = createRequire(workspace);
const requireFromPackage = createRequire(
  path.join(packageRoot, "package.json"),
);
// esbuild comes through vite, as in scripts/build-baseline-oracle.mjs.
const esbuild = createRequire(requireFromPackage.resolve("vite"))("esbuild");

const alienEntry = requireFromWorkspace.resolve("alien-signals");
const alienRoot = alienEntry.slice(
  0,
  alienEntry.lastIndexOf(`${path.sep}alien-signals${path.sep}`) +
    `${path.sep}alien-signals`.length,
);
const alienVersion = JSON.parse(
  readFileSync(path.join(alienRoot, "package.json"), "utf8"),
).version;
const out = path.join(packageRoot, ".cache/bench/reference-alien");

mkdirSync(out, { recursive: true });
await esbuild.build({
  entryPoints: [path.join(packageRoot, "bench/reference/alien.mjs")],
  bundle: true,
  format: "esm",
  platform: "neutral",
  minify: true,
  alias: { "alien-signals": path.join(alienRoot, "esm/index.mjs") },
  outfile: path.join(out, "runtime.mjs"),
  logLevel: "warning",
});
writeFileSync(
  path.join(out, "manifest.json"),
  `${JSON.stringify({ commit: `alien-signals@${alienVersion}`, minifier: "esbuild" }, null, 2)}\n`,
);
process.stdout.write(`${path.relative(packageRoot, out)}\n`);
