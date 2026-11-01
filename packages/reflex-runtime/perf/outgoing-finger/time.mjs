// Outgoing-finger timing: ns per pass of the cases of
// scripts/tracking-outgoing-locality.mjs (and optionally ladder rungs) for
// several production bundles.
//
//   node perf/outgoing-finger/time.mjs --bundle <name>=<spec> [--bundle ...]
//        [--reads shuffle] [--schedules forward,reverse,random]
//        [--deps 128] [--consumers 128] [--gaps 0]
//        [--ladder <rung parts> [--fanouts 3,128]]
//        [--lab <patterns> [--observers pull,watchers] [--lab-deps 256]
//         [--lab-consumers 128]]
//        [--samples 7] [--warmup-ms 150] [--batch-ms 30] [--node <path>]
//        [--out <file.json>]
//
// <spec> is a runtime.mjs path or `@<ref>`, optionally `+<variant>`: a
// production bundle of that commit (scripts/build-baseline-oracle.mjs
// --production) with a variant of ./analyze.mjs (`variantArgs`):
// `@HEAD+ring`, `@HEAD+ring+rotate`, `@HEAD+base+rotate`.
//
// As perf/tracking-ladder/time.mjs: every (sample, case, bundle) runs in its
// own process, the bundle order rotates per sample, a process reports the
// median of five batches, and a bundle's ratio to the first is the median
// over samples of the per-sample ratio. Local drift: read under ~3% as noise.
import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { cpus } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ladder, ladderCases } from "../../../../scripts/tracking-ladder.mjs";
import {
  labCases,
  labLongLong,
} from "../../../../scripts/tracking-lab-long-long.mjs";
import {
  localityCases,
  outgoingLocality,
} from "../../../../scripts/tracking-outgoing-locality.mjs";
import { variantArgs } from "./variants.mjs";

const packageRoot = path.resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args[at + 1];
};
const numbers = (name, fallback) =>
  option(name, fallback).split(",").map(Number);

if (args[0] === "--measure") {
  const [, bundle, encoded] = args;
  const c = JSON.parse(encoded);
  const rt = await import(pathToFileURL(bundle).href);
  const step =
    c.kind === "ladder"
      ? ladder(rt, c.name, c)
      : c.kind === "lab"
        ? labLongLong(rt, c)
        : outgoingLocality(rt, c);
  let index = 0;
  let sink = 0;
  const run = (n) => {
    const start = performance.now();
    for (let i = 0; i < n; i++) sink += step(index++);
    return performance.now() - start;
  };
  let n = 64;
  for (let spent = run(n); spent < c.warmupMs; spent += run(n)) n = n * 2;
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
const ladderSpec = option("--ladder");
const labSpec = option("--lab");
const cases = [
  ...(labSpec === undefined
    ? []
    : labCases({
        patterns: labSpec === "all" ? "" : labSpec,
        observers: option("--observers", "pull,watchers"),
        deps: numbers("--lab-deps", "256"),
        consumers: numbers("--lab-consumers", "128"),
      }).map((c) => ({ ...c, kind: "lab" }))),
  ...(option("--reads") === "none"
    ? []
    : localityCases({
        reads: option("--reads", "shuffle"),
        schedules: option("--schedules", "forward,reverse,random"),
        deps: numbers("--deps", "128"),
        consumers: numbers("--consumers", "128"),
        gaps: numbers("--gaps", "0"),
      }).map((c) => ({ ...c, kind: "locality" }))),
  ...(ladderSpec === undefined
    ? []
    : ladderCases({
        rungs: ladderSpec === "all" ? "" : ladderSpec,
        fanouts: numbers("--fanouts", "3,128"),
      }).map((c) => ({ ...c, id: `ladder:${c.id}`, kind: "ladder" }))),
];

function buildBundle(name, spec) {
  if (!spec.startsWith("@")) return path.resolve(spec);
  const at = spec.indexOf("+");
  const ref = at === -1 ? spec.slice(1) : spec.slice(1, at);
  const variant = at === -1 ? undefined : spec.slice(at + 1);
  const outDir = path.join(
    packageRoot,
    ".cache/oracle/outgoing-finger-time",
    name,
  );
  execFileSync(
    process.execPath,
    [
      "scripts/build-baseline-oracle.mjs",
      ...(ref === "source" ? ["--source"] : ["--commit", ref]),
      "--production",
      "--out",
      outDir,
      ...(variant ? variantArgs(variant) : []),
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
      ? [`${b.name} ns/read`]
      : [`${b.name} ns/read`, `vs ${first} (range)`],
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
    cells.push((m / readsPerPass[c.id]).toFixed(2));
    if (b.name !== first)
      cells.push(
        `${median(ratios).toFixed(3)} (${Math.min(...ratios).toFixed(2)}–${Math.max(...ratios).toFixed(2)})`,
      );
  }
  report.cases[c.id] = entry;
  console.log(`| ${cells.join(" | ")} |`);
}
if (out) writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
