// Builds the reflex-dom entry in the layout of js-framework-benchmark's
// `frameworks/keyed/<name>/` directories, for runs of the official harness
// that do not add Reflex to the official repository.
//
//   node build.mjs <js-framework-benchmark>/frameworks/keyed/reflex-dom
//
// The application is the one of the local benchmark (../js-framework); only
// the page differs: it loads the official stylesheet from the benchmark server.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { frameworks } from "../js-framework/build.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "framework");
const packageRoot = resolve(root, "../../..");

const outDir = process.argv[2];
if (outDir === undefined) {
  console.error("usage: node build.mjs <js-framework-benchmark>/frameworks/keyed/reflex-dom");
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
manifest["js-framework-benchmark"].frameworkVersion = version;

await build({
  configFile: false,
  root,
  base: "./",
  logLevel: "warn",
  mode: "production",
  ...frameworks["reflex-dom"].vite,
  build: {
    outDir: join(resolve(outDir), "dist"),
    emptyOutDir: true,
    minify: "esbuild",
    target: "es2022",
    modulePreload: false,
    reportCompressedSize: false,
  },
});

mkdirSync(resolve(outDir), { recursive: true });
writeFileSync(join(resolve(outDir), "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
// The server lists only directories with both a manifest and a lock file.
const lock = {
  name: manifest.name,
  version: manifest.version,
  lockfileVersion: 3,
  requires: true,
  packages: { "": { name: manifest.name, version: manifest.version } },
};
writeFileSync(join(resolve(outDir), "package-lock.json"), `${JSON.stringify(lock, null, 2)}\n`);

console.log(`reflex-dom ${version} -> ${resolve(outDir)}`);
