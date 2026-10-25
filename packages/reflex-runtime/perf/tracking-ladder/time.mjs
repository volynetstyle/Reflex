// Tracking ladder timing: ns per pass of every rung of
// scripts/tracking-ladder.mjs, for several production bundles.
//
//   node perf/tracking-ladder/time.mjs --bundle <name>=<spec> [--bundle ...]
//        [--rungs <regex>] [--fanouts 3,128] [--deps 128] [--samples 7]
//        [--warmup-ms 150] [--batch-ms 30] [--node <path>] [--out <file.json>]
//
// <spec> is a runtime.mjs path, or `@<ref>` / `@source` (a production bundle
// of that commit or of the working tree, built by
// scripts/build-baseline-oracle.mjs --production), optionally followed by
// `+<variant>` mutations from ./variants.mjs: `@HEAD+hint-first`.
//
// Every (sample, case, bundle) runs in its own process, so no JIT feedback
// or inlining decision crosses rungs or bundles; within a sample the bundle
// order rotates. A process warms the case up, then times five batches and
// reports their median. The ratio of a bundle to the first one is the
// median, over samples, of the per-sample ratio; local machines drift, so
// read differences under ~3% as noise (the paired CI comparison decides).
import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { cpus } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ladder, ladderCases } from "../../../../scripts/tracking-ladder.mjs";
import { variants } from "./variants.mjs";

const packageRoot = path.resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args[at + 1];
};

if (args[0] === "--measure") {
  const [, bundle, encoded] = args;
  const c = JSON.parse(encoded);
  const rt = await import(pathToFileURL(bundle).href);
  const step = ladder(rt, c.name, c);
  let index = 0;
  let sink = 0;
  const run = (n) => {
    const start = performance.now();
    for (let i = 0; i < n; i++) sink += step(index++);
    return performance.now() - start;
  };
  // Warm-up by time, at least 64 passes.
  let n = 64;
  for (let spent = run(n); spent < c.warmupMs; spent += run(n)) n = n * 2;
  // Batches of about batchMs each.
  const perStep = run(n) / n;
  const batch = Math.max(8, Math.round(c.batchMs / perStep));
  const times = [];
  for (let b = 0; b < 5; b++) times.push((run(batch) * 1e6) / batch);
  if (!Number.isFinite(sink)) throw new Error("invalid result");
  times.sort((a, b) => a - b);
  console.log(
    JSON.stringify({ ns: times[2], readsPerPass: step.readsPerPass }),
  );
  process.exit(0);
}

const node = option("--node", process.execPath);
const samples = Number(option("--samples", 7));
const warmupMs = Number(option("--warmup-ms", 150));
const batchMs = Number(option("--batch-ms", 30));
const out = option("--out");
const cases = ladderCases({
  rungs: new RegExp(option("--rungs", ".*")),
  fanouts: option("--fanouts", "3,128").split(",").map(Number),
  deps: Number(option("--deps", 128)),
});

function buildBundle(name, spec) {
  if (!spec.startsWith("@")) return path.resolve(spec);
  const [ref, ...mutants] = spec.slice(1).split("+");
  const outDir = path.join(
    packageRoot,
    ".cache/oracle/tracking-ladder-time",
    name,
  );
  const mutations = mutants.flatMap((m) => {
    if (!(m in variants)) throw new Error(`unknown variant ${m}`);
    return variants[m].flatMap((spec) => ["--mutate", spec]);
  });
  execFileSync(
    process.execPath,
    [
      "scripts/build-baseline-oracle.mjs",
      ...(ref === "source" ? ["--source"] : ["--commit", ref]),
      "--production",
      "--out",
      outDir,
      ...mutations,
    ],
    { cwd: packageRoot, stdio: "pipe" },
  );
  return path.join(outDir, "runtime.mjs");
}

const bundles = args
  .map((arg, i) => (arg === "--bundle" ? args[i + 1] : undefined))
  .filter(Boolean)
  .map((entry) => {
    const at = entry.indexOf("=");
    const name = entry.slice(0, at);
    const spec = entry.slice(at + 1);
    return { name, spec, file: buildBundle(name, spec) };
  });
if (bundles.length === 0) throw new Error("--bundle <name>=<spec> required");

const self = fileURLToPath(import.meta.url);
const runs = Object.fromEntries(
  cases.map((c) => [
    c.id,
    Object.fromEntries(bundles.map((b) => [b.name, []])),
  ]),
);
const readsPerPass = {};
for (let sample = 0; sample < samples; sample++) {
  for (const c of cases) {
    const order = bundles.map((_, i) => bundles[(i + sample) % bundles.length]);
    if (sample % 2 === 1) order.reverse();
    for (const b of order) {
      const result = spawnSync(
        node,
        [
          self,
          "--measure",
          b.file,
          JSON.stringify({ ...c, warmupMs, batchMs }),
        ],
        { encoding: "utf8", windowsHide: true },
      );
      if (result.status !== 0)
        throw new Error(`${c.id} on ${b.name}: ${result.stderr}`);
      const { ns, readsPerPass: reads } = JSON.parse(result.stdout);
      runs[c.id][b.name].push(ns);
      readsPerPass[c.id] = reads;
    }
  }
  process.stderr.write(`sample ${sample + 1}/${samples}\n`);
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
};
const first = bundles[0].name;
const report = {
  node: spawnSync(node, ["--version"], { encoding: "utf8" }).stdout.trim(),
  cpu: cpus()[0]?.model,
  bundles: bundles.map(({ name, spec }) => ({ name, spec })),
  samples,
  warmupMs,
  batchMs,
  cases: {},
};
const header = [
  "case",
  "reads/pass",
  ...bundles.flatMap((b, i) =>
    i === 0
      ? [`${b.name} ns/pass`, "ns/read"]
      : [`${b.name} ns/pass`, `vs ${first} (range)`],
  ),
];
console.log(`| ${header.join(" | ")} |`);
console.log(
  `| ${header.map((_, i) => (i === 0 ? "---" : "---:")).join(" | ")} |`,
);
for (const c of cases) {
  const entry = { readsPerPass: readsPerPass[c.id], bundles: {} };
  const base = runs[c.id][first];
  const cells = [c.id, readsPerPass[c.id]];
  for (const b of bundles) {
    const times = runs[c.id][b.name];
    const ratios = times.map((t, i) => t / base[i]);
    const m = median(times);
    entry.bundles[b.name] = {
      nsPerPass: m,
      nsPerRead: m / readsPerPass[c.id],
      ratio: median(ratios),
      ratioRange: [Math.min(...ratios), Math.max(...ratios)],
      times,
    };
    if (b.name === first)
      cells.push(m.toFixed(0), (m / readsPerPass[c.id]).toFixed(2));
    else
      cells.push(
        m.toFixed(0),
        `${median(ratios).toFixed(3)} (${Math.min(...ratios).toFixed(2)}–${Math.max(...ratios).toFixed(2)})`,
      );
  }
  report.cases[c.id] = entry;
  console.log(`| ${cells.join(" | ")} |`);
}
if (out) writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
