/**
 * DOM compiler benchmark: baseline reflex-dom vs compiled native-tree vs
 * compiled template, in Chromium, Firefox and WebKit.
 *
 *   pnpm bench                       # all engines, frozen corpus
 *   pnpm bench -- --browsers=chromium --quick
 *   pnpm bench -- --refreeze         # accept a changed corpus or harness
 *
 * Each instance is one row of reflex-dom's `For` whose callback returns the
 * scenario tree. Run from the package directory. Writes
 * bench/results/latest.{json,md}.
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { build, transform, type Plugin } from "esbuild";
import { chromium, firefox, webkit, type BrowserType } from "playwright";
import { runtimeFlags } from "../../../tooling/configs/runtime-flags";
import { transformReflexDOM } from "../src/transform";
import { toFunctionBody } from "../test/harness/compile.node";
import type { BenchInput, Measurement } from "./page";

const root = process.cwd();
if (!existsSync(join(root, "src/runtime.ts"))) throw new Error("Run from packages/reflex-dom-compiler");
const packages = resolve(root, "..");

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key!, value ?? "true"] as const;
  }),
);
const quick = args.has("quick");
const browserNames = (args.get("browsers") ?? "chromium,firefox,webkit").split(",");
const VARIANTS = ["baseline", "native", "template"] as const;

// --- Source resolution: reflex packages from source, production flags --------

const ALIASES: [string, string][] = [
  ["@volynets/reflex-runtime/internal", "reflex-runtime/src/internal/index.ts"],
  ["@volynets/reflex-runtime", "reflex-runtime/src/index.ts"],
  ["@runtime", "reflex-runtime/src"],
  ["@volynets/reflex-scheduler", "reflex-scheduler/src/index.ts"],
  ["@volynets/reflex-framework/jsx-runtime", "reflex-framework/src/jsx-runtime.ts"],
  ["@volynets/reflex-framework/jsx-dev-runtime", "reflex-framework/src/jsx-dev-runtime.ts"],
  ["@volynets/reflex-framework", "reflex-framework/src/index.ts"],
  ["@volynets/reflex-dom/jsx-runtime", "reflex-dom/src/jsx-runtime.ts"],
  ["@volynets/reflex-dom", "reflex-dom/src/index.ts"],
  ["@volynets/reflex-dom-compiler/runtime", "reflex-dom-compiler/src/runtime.ts"],
];

function existing(path: string): string {
  for (const candidate of [path, `${path}.ts`, join(path, "index.ts")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`Cannot resolve ${path}`);
}

const sourcePlugin: Plugin = {
  name: "reflex-source",
  setup(b) {
    b.onResolve({ filter: /^(@volynets\/reflex|@runtime)/ }, ({ path }) => {
      for (const [find, target] of ALIASES) {
        if (path === find) return { path: existing(join(packages, target)) };
        if (path.startsWith(`${find}/`)) {
          return { path: existing(join(packages, target, path.slice(find.length + 1))) };
        }
      }
      return undefined;
    });
  },
};

const define = Object.fromEntries(
  Object.entries(runtimeFlags("production")).map(([key, value]) => [key, String(value)]),
);

async function bundle(options: Parameters<typeof build>[0]): Promise<string> {
  const result = await build({
    bundle: true,
    write: false,
    minify: true,
    target: "es2022",
    define,
    plugins: [sourcePlugin],
    logLevel: "error",
    ...options,
  });
  return result.outputFiles![0]!.text;
}

const size = (code: string) => ({ min: Buffer.byteLength(code), gzip: gzipSync(code).length });

// --- Scenarios ---------------------------------------------------------------

interface Scenario {
  name: string;
  nodes: number;
  modules: Record<(typeof VARIANTS)[number], string>;
}

async function compileScenario(file: string): Promise<Scenario> {
  const source = readFileSync(file, "utf8");
  const lowered = (
    await transform(source, { loader: "tsx", jsx: "automatic", jsxImportSource: "@volynets/reflex-dom", format: "esm" })
  ).code;
  const native = transformReflexDOM(lowered, { strategy: "native", filename: file });
  const template = transformReflexDOM(lowered, { strategy: "template", filename: file });
  for (const [variant, out] of [["native", native], ["template", template]] as const) {
    const [region] = out.report.regions;
    if (out.report.regions.length !== 1 || region!.strategy !== variant) {
      throw new Error(`${file}: expected one ${variant} region, got ${JSON.stringify(out.report.regions)}`);
    }
  }
  return {
    name: file.replace(/^.*[\\/](.*)\.tsx$/, "$1"),
    nodes: native.report.regions[0]!.nodes,
    modules: { baseline: lowered, native: native.code, template: template.code },
  };
}

// --- Main --------------------------------------------------------------------

const scenarioDir = join(root, "bench/scenarios");
const scenarios = await Promise.all(
  readdirSync(scenarioDir)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => compileScenario(join(scenarioDir, f))),
);
scenarios.sort((a, b) => a.nodes - b.nodes);

const sizes: Record<string, Record<string, { module: ReturnType<typeof size>; app: ReturnType<typeof size> }>> = {};
for (const scenario of scenarios) {
  sizes[scenario.name] = {};
  for (const variant of VARIANTS) {
    const code = scenario.modules[variant];
    const moduleOnly = (await transform(code, { minify: true, format: "esm", target: "es2022" })).code;
    // The scenario's default export renders it, so the module is a complete app.
    const app = await bundle({ stdin: { contents: code, resolveDir: root, loader: "js" }, format: "esm" });
    sizes[scenario.name]![variant] = { module: size(moduleOnly), app: size(app) };
  }
}
const helperSize = size(await bundle({ entryPoints: [join(root, "src/runtime.ts")], format: "esm" }));

const page = await bundle({ entryPoints: [join(root, "bench/page.ts")], format: "iife" });

const input: BenchInput = {
  scenarios: scenarios.map((s) => ({
    name: s.name,
    nodes: s.nodes,
    variants: Object.fromEntries(VARIANTS.map((v) => [v, toFunctionBody(s.modules[v])])),
  })),
  counts: quick ? [100, 1000] : [100, 1000, 10000],
  samples: quick ? 5 : 11,
  coldBatch: quick ? 100 : 300,
  memoryCount: 10000,
  memoryRounds: Number(args.get("memory-rounds") ?? 5),
};

// --- Frozen corpus -------------------------------------------------------------
// Scenarios and harness are pinned by hash, so results stay comparable across
// commits. Changing either is a deliberate act: `--refreeze`.

const sha256 = (text: string) =>
  createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");
const corpusFiles = [
  ...readdirSync(scenarioDir).filter((f) => f.endsWith(".tsx")).sort().map((f) => `bench/scenarios/${f}`),
  "bench/page.ts",
  "bench/run.ts",
];
const fileHashes = Object.fromEntries(corpusFiles.map((f) => [f, sha256(readFileSync(join(root, f), "utf8"))]));
const corpusHash = sha256(JSON.stringify(fileHashes));
const parameters = {
  counts: input.counts,
  samples: input.samples,
  coldBatch: input.coldBatch,
  memoryCount: input.memoryCount,
  memoryRounds: input.memoryRounds,
};
const git = (command: string) => execSync(`git ${command}`, { cwd: root, encoding: "utf8" }).trim();
const commit = git("rev-parse HEAD");
// Uncommitted changes in anything measured; results and the lock are outputs.
const dirty =
  git(
    `status --porcelain -- . ":!bench/results" ":!bench/corpus.lock.json" ` +
      `../reflex-dom ../reflex-framework ../reflex-runtime ../reflex-scheduler`,
  ) !== "";
const lockPath = join(root, "bench/corpus.lock.json");

if (args.has("refreeze")) {
  if (quick) throw new Error("Freeze the corpus with full-run parameters, not --quick");
  writeFileSync(lockPath, `${JSON.stringify({ version: 1, frozenAt: commit, corpusHash, files: fileHashes, parameters }, null, 2)}\n`);
  console.log(`Corpus frozen: ${corpusHash.slice(0, 12)}`);
} else {
  if (!existsSync(lockPath)) throw new Error("No frozen corpus: run with --refreeze");
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  const changed = corpusFiles.filter((f) => lock.files[f] !== fileHashes[f]);
  const removed = Object.keys(lock.files).filter((f) => !(f in fileHashes));
  if (changed.length + removed.length > 0) {
    throw new Error(`Benchmark corpus changed (${[...changed, ...removed].join(", ")}); rerun with --refreeze to accept`);
  }
  if (!quick && JSON.stringify(lock.parameters) !== JSON.stringify(parameters)) {
    throw new Error(`Parameters differ from the frozen corpus: ${JSON.stringify(lock.parameters)}`);
  }
}

const engines: Record<string, BrowserType> = { chromium, firefox, webkit };
interface MemoryResult {
  scenario: string;
  variant: string;
  retainedBytesPerInstance: number;
  residualBytes: number;
}
const runs: Record<
  string,
  { results: Measurement[]; memory: MemoryResult[]; timerResolutionUs: number; userAgent: string }
> = {};

for (const name of browserNames) {
  const engine = engines[name];
  if (engine === undefined) throw new Error(`Unknown browser ${name}`);
  const browser = await engine.launch({
    args: name === "chromium" ? ["--js-flags=--expose-gc", "--enable-precise-memory-info"] : [],
  });
  const openPage = async () => {
    const tab = await browser.newPage();
    await tab.setContent("<!doctype html><html><head></head><body></body></html>");
    await tab.addScriptTag({ content: page });
    return tab;
  };

  process.stdout.write(`${name}: timing... `);
  const started = Date.now();
  // One fresh page per scenario: no scenario inherits another's heap, GC
  // pressure or JIT state (and a long run cannot exhaust one tab).
  const timing = { results: [] as Measurement[], timerResolutionUs: 0, userAgent: "" };
  for (const scenario of input.scenarios) {
    const tab = await openPage();
    const part = await tab.evaluate(
      (data) => (globalThis as any).__bench.run(data),
      { ...input, scenarios: [scenario] },
    );
    await tab.close();
    timing.results.push(...part.results);
    timing.timerResolutionUs = part.timerResolutionUs;
    timing.userAgent = part.userAgent;
  }

  // Memory needs a clean heap: one fresh page per scenario and variant.
  const memory: MemoryResult[] = [];
  if (name === "chromium") {
    process.stdout.write(`memory... `);
    for (const scenario of input.scenarios) {
      for (const variant of VARIANTS) {
        const fresh = await openPage();
        const result = await fresh.evaluate(
          ([body, count, rounds]) => (globalThis as any).__bench.memory(body, count, rounds),
          [scenario.variants[variant]!, input.memoryCount, input.memoryRounds] as const,
        );
        await fresh.close();
        if (result !== null) memory.push({ scenario: scenario.name, variant, ...result });
      }
    }
  }
  runs[name] = { ...timing, memory };
  console.log(`${((Date.now() - started) / 1000).toFixed(1)}s`);
  await browser.close();
}

// --- Report ------------------------------------------------------------------

const resultsDir = join(root, "bench/results");
mkdirSync(resultsDir, { recursive: true });
const report = {
  date: new Date().toISOString(),
  quick,
  commit,
  dirty,
  corpusHash,
  methodology: "one reflex-dom For row per instance; the callback returns the scenario tree",
  scenarios: scenarios.map((s) => ({ name: s.name, nodes: s.nodes })),
  sizes,
  helperSize,
  runs,
};
writeFileSync(join(resultsDir, "latest.json"), JSON.stringify(report, null, 2));

const fmt = (us: number) => (us >= 100 ? us.toFixed(0) : us >= 10 ? us.toFixed(1) : us.toFixed(2));
const lines: string[] = [
  `# DOM compiler benchmark`,
  ``,
  `${report.date}${quick ? " (quick, not comparable)" : ""}. ` +
    `Commit \`${commit.slice(0, 10)}\`${dirty ? " + uncommitted changes" : ""}, corpus \`${corpusHash.slice(0, 12)}\`.`,
  ``,
  "Each instance is one row of reflex-dom's `For` whose callback returns the scenario tree. " +
    "Median µs per mounted instance; ratio is variant / baseline (lower is faster).",
  ``,
];

for (const [browser, run] of Object.entries(runs)) {
  lines.push(`## ${browser}`, ``, `${run.userAgent}  `, `Timer resolution: ${fmt(run.timerResolutionUs)} µs`, ``);
  lines.push(`| scenario | nodes | metric | count | baseline | native | template | native/base | template/base |`);
  lines.push(`|---|---:|---|---:|---:|---:|---:|---:|---:|`);
  const find = (scenario: string, variant: string, metric: string, count: number) =>
    run.results.find((r) => r.scenario === scenario && r.variant === variant && r.metric === metric && r.count === count)!
      .usPerInstance;
  for (const scenario of scenarios) {
    const rows: [string, number][] = [["cold", 1], ...input.counts.flatMap((c) => [["mount", c], ["mount+dispose", c]] as [string, number][])];
    for (const [metric, count] of rows) {
      const [b, n, t] = VARIANTS.map((v) => find(scenario.name, v, metric, count));
      lines.push(
        `| ${scenario.name} | ${scenario.nodes} | ${metric} | ${count} | ${fmt(b!)} | ${fmt(n!)} | ${fmt(t!)} | ${(n! / b!).toFixed(2)} | ${(t! / b!).toFixed(2)} |`,
      );
    }
  }

  lines.push(``, `Break-even (template vs native, from cold and 1000-instance mount):`, ``);
  for (const scenario of scenarios) {
    const cold = (v: string) => find(scenario.name, v, "cold", 1);
    const warm = (v: string) => find(scenario.name, v, "mount", 1000);
    const extraCold = cold("template") - cold("native");
    const warmGain = warm("native") - warm("template");
    const verdict =
      warmGain <= 0
        ? "template never catches up (slower per mount)"
        : extraCold <= 0
          ? "template wins from the first mount"
          : `template pays off after ~${Math.ceil(1 + extraCold / warmGain)} mounts`;
    lines.push(`- ${scenario.name} (${scenario.nodes} nodes): ${verdict}`);
  }

  if (run.memory.length > 0) {
    lines.push(
      ``,
      `JS heap retained while mounted, per instance (Chromium, fresh page, median of ${input.memoryRounds} rounds of ${input.memoryCount} instances). ` +
        `Post-dispose residuals are not reported: \`bench/memory-probe.ts\` reproduces the same per-cycle growth with plain DOM code and no Reflex.`,
      ``,
    );
    lines.push(`| scenario | variant | bytes/instance |`, `|---|---|---:|`);
    for (const m of run.memory) {
      lines.push(`| ${m.scenario} | ${m.variant} | ${m.retainedBytesPerInstance.toFixed(0)} |`);
    }
  }
  lines.push(``);
}

lines.push(`## Bundle size`, ``, `Minified bytes / gzip bytes. "app" bundles the scenario with reflex-dom (production, tree-shaken). The compiler runtime helper is ${helperSize.min} / ${helperSize.gzip} bytes.`, ``);
lines.push(`| scenario | variant | module | app |`, `|---|---|---:|---:|`);
for (const scenario of scenarios) {
  for (const variant of VARIANTS) {
    const s = sizes[scenario.name]![variant]!;
    lines.push(`| ${scenario.name} | ${variant} | ${s.module.min} / ${s.module.gzip} | ${s.app.min} / ${s.app.gzip} |`);
  }
}

writeFileSync(join(resultsDir, "latest.md"), `${lines.join("\n")}\n`);
console.log(lines.join("\n"));
