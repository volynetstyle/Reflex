/**
 * Is the per-cycle heap growth caused by reflex-dom's render/dispose path?
 * Mounts identical plain-DOM nodes with and without `render`.
 *
 *   node bench/run-ts.mjs bench/memory-probe.ts
 */
import { join } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import { runtimeFlags } from "../../../tooling/configs/runtime-flags";

// Reuse run.ts's source build by importing nothing from it: bundle page.ts
// the same way, with the reflex packages resolved from source.
const packages = join(process.cwd(), "..");
const define = Object.fromEntries(
  Object.entries(runtimeFlags("production")).map(([k, v]) => [k, String(v)]),
);
const aliases: Record<string, string> = {
  "@volynets/reflex-runtime/internal": "reflex-runtime/src/internal/index.ts",
  "@volynets/reflex-runtime": "reflex-runtime/src/index.ts",
  "@volynets/reflex-scheduler": "reflex-scheduler/src/index.ts",
  "@volynets/reflex-framework/jsx-runtime": "reflex-framework/src/jsx-runtime.ts",
  "@volynets/reflex-framework": "reflex-framework/src/index.ts",
  "@volynets/reflex-dom/jsx-runtime": "reflex-dom/src/jsx-runtime.ts",
  "@volynets/reflex-dom": "reflex-dom/src/index.ts",
};
const page = (
  await build({
    entryPoints: [join(process.cwd(), "bench/page.ts")],
    bundle: true,
    write: false,
    minify: true,
    format: "iife",
    define,
    logLevel: "error",
    plugins: [
      {
        name: "source",
        setup(b) {
          b.onResolve({ filter: /^(@volynets\/reflex|@runtime)/ }, async ({ path, resolveDir }) => {
            if (aliases[path]) return { path: join(packages, aliases[path]!) };
            if (path.startsWith("@runtime/")) {
              const r = await b.resolve(`./${path.slice(9)}`, {
                resolveDir: join(packages, "reflex-runtime/src"),
                kind: "import-statement",
              });
              return { path: r.path };
            }
            void resolveDir;
            return undefined;
          });
        },
      },
    ],
  })
).outputFiles[0]!.text;

const browser = await chromium.launch({ args: ["--js-flags=--expose-gc", "--enable-precise-memory-info"] });
for (const throughRender of [false, true]) {
  const tab = await browser.newPage();
  await tab.setContent("<!doctype html><body></body>");
  await tab.addScriptTag({ content: page });
  const growth: number[] = await tab.evaluate(
    (via) => (globalThis as any).__bench.memoryProbe(10000, 30, via),
    throughRender,
  );
  let total = 0;
  const cumulative = growth.map((g) => (total += g) / 1e6);
  console.log(
    `${throughRender ? "through render()" : "plain append   "}: cumulative MB at rounds 5/10/20/30:`,
    [4, 9, 19, 29].map((i) => cumulative[i]!.toFixed(2)).join(" / "),
  );
  await tab.close();
}
await browser.close();
