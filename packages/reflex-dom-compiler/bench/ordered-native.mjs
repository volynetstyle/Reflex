// Paired compiler on/off comparison using the same app and standalone runtime.
// Build reflex-dom first, then: pnpm --filter @volynets/reflex-dom-compiler bench:ordered
import { build } from "vite";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApps, buildRoot, frameworks } from "../../reflex-dom/bench/js-framework/build.mjs";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const extra = process.argv.slice(2).filter(arg => arg !== "--");
await buildApps(["reflex-dom"], { compiler: true });
await build({
  configFile: false,
  root: join(repoRoot, "packages/reflex-dom/bench/js-framework/apps/reflex-dom"),
  base: "./", logLevel: "warn", mode: "production",
  ...frameworks["reflex-dom"].vite,
  build: {
    outDir: join(buildRoot, "reflex-dom-runtime"), emptyOutDir: true,
    minify: "esbuild", target: "es2022", modulePreload: false, reportCompressedSize: false,
  },
});
frameworks["reflex-dom-runtime"] = { label: "reflex-dom-runtime" };
process.argv = [process.execPath, "run.mjs", "--frameworks=reflex-dom-runtime,reflex-dom",
  "--compiler", "--skip-build", "--benchmarks=01,03,07,09", "--count=7", ...extra];
await import("../../reflex-dom/bench/js-framework/run.mjs");
