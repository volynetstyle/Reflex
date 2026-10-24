import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { cpus } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import replace from "@rollup/plugin-replace";
import nodeResolve from "@rollup/plugin-node-resolve";
import { rollup } from "rollup";
import { longLong, longLongModes } from "./tracking-long-long.mjs";

// Run build:ts before --save. Independent production bundles run in alternating
// subprocesses to keep JIT feedback and node/edge shapes isolated.
// node scripts/compare-tracking-graph.mjs --save baseline
// node scripts/compare-tracking-graph.mjs --save candidate
// node scripts/compare-tracking-graph.mjs baseline candidate
const directory = resolve("temp/tracking-graph");
await mkdir(directory, { recursive: true });
const [first = "baseline", second = "candidate"] = process.argv.slice(2);
const bundlePath = (name) => resolve(directory, `${name}.mjs`);
if (first === "--save") {
  const bundle = await rollup({
    input: "packages/reflex-runtime/build/esm/src/internal/index.js",
    plugins: [
      nodeResolve({ extensions: [".js"] }),
      replace({
        preventAssignment: true,
        values: {
          __DEV__: "false",
          __PROFILE__: "false",
          __TEST__: "false",
          __PROD__: "true",
          __TRACKING_ONE_HOP__: "true",
          __TRACKING_TWO_HOP__: "true",
          __TRACKING_LAST_EDGE__: "true",
        },
      }),
    ],
    onwarn(warning, warn) {
      if (warning.code !== "CIRCULAR_DEPENDENCY") warn(warning);
    },
    treeshake: { preset: "recommended" },
  });
  await bundle.write({ file: bundlePath(second), format: "esm" });
  await bundle.close();
  console.log(`Saved ${second}: ${bundlePath(second)}`);
  process.exit(0);
}

const node = (r) => new r.ReactiveNode(undefined, undefined, 0);
const range = (n) => Array.from({ length: n }, (_, i) => i);
function shuffled(pass, count) {
  const order = range(count);
  let seed = pass + 1;
  for (let i = count - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
// Every pass takes a fresh stamp from the clock, as enterConsumerTracking does;
// without it all passes would share stamp 0, which no real pass uses.
// `otherFirst` subscribers of each source precede the target in its outgoing
// list, the remaining `fanout - 1 - otherFirst` follow it.
function tracking(
  r,
  pattern,
  count = 128,
  fanout = 1,
  otherFirst = fanout - 1,
) {
  const sources = range(count).map(() => node(r));
  const others = (n) => {
    for (let i = 0; i < n; i++) {
      const other = node(r);
      for (const source of sources) r.linkEdge(source, other);
    }
  };
  others(otherFirst);
  const target = node(r);
  for (const source of sources) r.linkEdge(source, target);
  others(fanout - 1 - otherFirst);
  const orders = range(64).map((pass) => pattern(pass, count));
  return (pass) => {
    r.advanceTrackingEpoch();
    target.tailIn = null;
    for (const index of orders[pass % orders.length])
      r.resolveTrackedRead(sources[index], target, pass + 1, true);
    r.cleanupUnvisitedSources(target);
    return target.tailIn?.version ?? 0;
  };
}
function appendShared(r, fanout) {
  const sources = range(128).map(() => node(r));
  for (let i = 0; i < fanout; i++) {
    const other = node(r);
    for (const source of sources) r.linkEdge(source, other);
  }
  const target = node(r);
  return (pass) => {
    r.advanceTrackingEpoch();
    for (const source of sources)
      r.resolveTrackedRead(source, target, pass + 1, true);
    const value = target.tailIn.version;
    r.unlinkAllSources(target);
    return value;
  };
}
function moves(r, kind) {
  const target = node(r);
  for (let i = 0; i < 128; i++) r.linkEdge(node(r), target);
  return () => {
    for (let i = 0; i < 128; i++) {
      if (kind === "front")
        r.moveNonHeadIncomingEdgeToFrontUnchecked(target, target.lastIn.prevIn);
      else if (kind === "tail")
        r.moveLastIncomingEdgeAfterEdgeUnchecked(
          target,
          target.lastIn,
          target.firstIn,
        );
      else
        r.moveIncomingEdgeAfterUnchecked(target, target.firstIn, target.lastIn);
    }
    return target.firstIn.version;
  };
}
function reuse(r, fanout) {
  const target = node(r);
  const sources = range(128).map(() => node(r));
  for (let i = 1; i < fanout; i++) {
    const other = node(r);
    for (const source of sources) r.linkEdge(source, other);
  }
  for (const source of sources) r.linkEdge(source, target);
  const orders = range(64).map((p) => shuffled(p, 128));
  return (pass) => {
    for (const index of orders[pass % 64]) {
      r.reuseIncomingEdgeFromSuffixOrLink(
        sources[index],
        target,
        null,
        target.firstIn,
        pass + 1,
      );
    }
    return target.firstIn.version;
  };
}
function runtimeReorder(r) {
  const phase = r.createProducer(-1);
  const sources = range(128).map((i) => r.createProducer(i));
  const orders = range(64).map((p) => shuffled(p, 128));
  const target = r.createConsumer(() => {
    const pass = r.readProducer(phase);
    let value = 0;
    for (const index of orders[(pass + 64) % 64])
      value += r.readProducer(sources[index]);
    return value;
  });
  r.readConsumer(target);
  return (pass) => {
    r.writeProducer(phase, pass);
    return r.readConsumer(target);
  };
}
const scenarios = {
  "stable-128": (r) => tracking(r, (_p, n) => range(n)),
  "cursor-duplicates": (r) =>
    tracking(r, (_p, n) => range(n).flatMap((i) => [i, i, i])),
  "distant-duplicates": (r) =>
    tracking(r, (_p, n) => [...range(n), ...range(n)], 128, 3),
  "prefix-head-duplicates": (r) =>
    tracking(
      r,
      (_p, n) => range(n).flatMap((i) => (i === 0 ? [0] : [i, 0])),
      128,
      3,
    ),
  "rotate-right": (r) =>
    tracking(r, (p, n) => range(n).map((i) => (i - p + n) % n)),
  "permuted-fanout-1": (r) => tracking(r, shuffled),
  "permuted-fanout-3": (r) => tracking(r, shuffled, 128, 3),
  "permuted-fanout-8-mid": (r) => tracking(r, shuffled, 128, 8, 4),
  "permuted-fanout-8-first": (r) => tracking(r, shuffled, 128, 8, 0),
  "permuted-512-fanout-3": (r) => tracking(r, shuffled, 512, 3, 1),
  "reverse-fanout-3": (r) =>
    tracking(r, (_p, n) => range(n).map((i) => n - 1 - i), 128, 3, 1),
  "swap-pairs-fanout-3": (r) =>
    tracking(
      r,
      (p, n) => range(n).map((i) => (p % 2 === 0 ? i : i ^ 1)),
      128,
      3,
      1,
    ),
  "distant-duplicates-mid": (r) =>
    tracking(r, (_p, n) => [...range(n), ...range(n)], 128, 8, 4),
  "branch-swap-mid": (r) =>
    tracking(
      r,
      (p, n) =>
        range(n).filter((i) => (i < 48 || i >= 80 ? true : i % 2 === p % 2)),
      128,
      3,
      1,
    ),
  "append-shared-2": (r) => appendShared(r, 2),
  "append-shared-4": (r) => appendShared(r, 4),
  "append-shared-64": (r) => appendShared(r, 64),
  "move-to-front": (r) => moves(r, "front"),
  "move-tail": (r) => moves(r, "tail"),
  "move-general": (r) => moves(r, "general"),
  "reuse-first-out": (r) => reuse(r, 1),
  "reuse-scanned": (r) => reuse(r, 3),
  "runtime-reorder": runtimeReorder,
  ...Object.fromEntries(
    Object.entries(longLongModes).map(([name, options]) => [
      name,
      (r) => longLong(r, options),
    ]),
  ),
};
const median = (values) =>
  [...values].sort((a, b) => a - b)[values.length >> 1];
// TRACKING_ONLY=<regex> limits the scenarios; TRACKING_ITERATIONS and
// TRACKING_WARMUP shorten runs of the heavy wide x wide scenarios.
const only = new RegExp(process.env.TRACKING_ONLY ?? ".*");
const selected = Object.keys(scenarios).filter((name) => only.test(name));
const samples = 9;
const iterations = Number(process.env.TRACKING_ITERATIONS ?? 20000);
const warmup = Number(process.env.TRACKING_WARMUP ?? 10000);
if (first === "--measure") {
  const runtime = await import(pathToFileURL(bundlePath(second)).href);
  const timings = {};
  let sink = 0;
  for (const name of selected) {
    const setup = scenarios[name];
    const step = setup(runtime);
    for (let i = 0; i < warmup; i++) sink += step(i);
    const start = performance.now();
    for (let i = 0; i < iterations; i++) sink += step(i + warmup);
    timings[name] = ((performance.now() - start) * 1e6) / iterations;
  }
  if (!Number.isFinite(sink)) throw new Error("Invalid benchmark result");
  console.log(JSON.stringify(timings));
  process.exit(0);
}
const report = {
  node: process.version,
  cpu: cpus()[0]?.model,
  baseline: first,
  candidate: second,
  samples,
  iterations,
  warmup,
  scenarios: {},
};
const runs = [[], []];
for (let sample = 0; sample < samples; sample++) {
  for (const index of sample % 2 === 0 ? [0, 1] : [1, 0]) {
    const output = execFileSync(
      process.execPath,
      [fileURLToPath(import.meta.url), "--measure", [first, second][index]],
      { encoding: "utf8", windowsHide: true },
    );
    runs[index].push(JSON.parse(output));
  }
  console.log(`Completed pair ${sample + 1}/${samples}`);
}
for (const name of selected) {
  const timings = runs.map((run) => run.map((sample) => sample[name]));
  const before = median(timings[0]);
  const after = median(timings[1]);
  report.scenarios[name] = {
    beforeNs: before,
    afterNs: after,
    speedup: before / after,
    timings,
  };
  console.log(
    `${name.padEnd(24)} ${before.toFixed(0).padStart(8)} -> ${after.toFixed(0).padStart(8)} ns/pass  ${(before / after).toFixed(2)}x`,
  );
}
await writeFile(
  resolve(directory, "comparison.json"),
  JSON.stringify(report, null, 2) + "\n",
);
