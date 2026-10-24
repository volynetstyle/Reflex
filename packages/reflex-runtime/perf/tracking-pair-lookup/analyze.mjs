// Pair-lookup profile: where does the tracking lookup still cost links, and
// would a per-producer slot (`P.trackEdge`) remove them?
//
//   node perf/tracking-pair-lookup/analyze.mjs [--steps 200] [--out <file.json>]
//
// Builds a PROFILE bundle of the working tree with one analysis-only hook
// (`globalThis.__reflexTrackRead(producer, consumer)` at the top of
// resolveTrackedRead; the source is not changed) and runs the wide x wide
// modes of scripts/tracking-long-long.mjs plus every timed workload of
// bench/workloads.mjs. For each read that reaches findEdgeInLockstep it
// records D = min(out(P), in(C)) before the read and the links the lookup
// compared (projection `tracking.locate.step`, one event per link).
//
// The slot is simulated, never built. A slot holds one edge per producer and
// is a positive cache: a hit needs `edge.to === C` and a live edge; a miss
// proves nothing and pays the lockstep lookup. Policies:
//   lookup  write the slot after every lookup
//   every   write the slot after every read (upper bound; a hot-path store)
//   arm     on the first lookup of a pass, write the slots of all of C's
//           edges (cost in(C) stores), then as `lookup`
// Hit rates are over lookups whose pair has an edge (absence always pays
// the lookup). Estimated links/read with a slot count one slot check per
// lookup, the lockstep links of misses and, for `arm`, the arming stores.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { workloads } from "../../bench/workloads.mjs";
import {
  longLong,
  longLongModes,
} from "../../../../scripts/tracking-long-long.mjs";

const packageRoot = path.resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args[at + 1];
};
const STEPS = Number(option("--steps", 200));
const out = option("--out");

const RESOLVE =
  'observeRuntimeProjection?.("projection.semantic.tracking.resolve");';
const outDir = path.join(packageRoot, ".cache/oracle/tracking-pair-lookup");
execFileSync(
  process.execPath,
  [
    "scripts/build-baseline-oracle.mjs",
    "--source",
    "--profile",
    "--out",
    outDir,
    "--mutate",
    `src/kernel/shape/tracking/resolve.ts::${RESOLVE}::${RESOLVE.slice(0, -1)}, globalThis.__reflexTrackRead?.(producer, consumer);`,
  ],
  { cwd: packageRoot, stdio: "pipe" },
);
const rt = await import(pathToFileURL(path.join(outDir, "runtime.mjs")).href);

const outDegree = (node) => {
  let n = 0;
  for (let e = node.firstOut; e !== null; e = e.nextOut) n++;
  return n;
};
const inDegree = (node) => {
  let n = 0;
  for (let e = node.firstIn; e !== null; e = e.nextIn) n++;
  return n;
};
const edgeOf = (p, c) => {
  for (let e = p.firstOut; e !== null; e = e.nextOut) if (e.to === c) return e;
  return null;
};
const alive = (e) => e.prevOut !== null || e.from.firstOut === e;
const percentile = (sorted, q) =>
  sorted.length === 0
    ? null
    : sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

function createProbe() {
  const stats = {
    reads: 0,
    lookups: 0,
    links: 0,
    d: [],
    perLookup: [],
    withEdge: 0,
    hits: { lookup: 0, every: 0, arm: 0 },
    saved: { lookup: 0, every: 0, arm: 0 },
    armStores: 0,
  };
  const slots = { lookup: new Map(), every: new Map(), arm: new Map() };
  const passOf = new Map();
  const armed = new Map();
  let passes = 0;
  let current = null;

  const hit = (slot, p, c) => {
    const e = slot.get(p);
    return e !== undefined && e.to === c && alive(e);
  };
  const finish = () => {
    if (current === null) return;
    const { p, c, steps } = current;
    const e = edgeOf(p, c);
    if (e !== null) {
      slots.every.set(p, e);
      if (steps > 0) {
        slots.lookup.set(p, e);
        slots.arm.set(p, e);
      }
    }
    if (steps > 0) {
      for (const name of current.hits) stats.saved[name] += steps;
      stats.lookups++;
      stats.links += steps;
      stats.perLookup.push(steps);
    }
    current = null;
  };

  globalThis.__reflexTrackRead = (p, c) => {
    finish();
    stats.reads++;
    if (c.tailIn === null) passOf.set(c, ++passes);
    current = { p, c, steps: 0, hits: [] };
  };
  rt.setRuntimeProjectionObserver((observation) => {
    if (
      observation.id !== "projection.semantic.tracking.locate.step" ||
      current === null
    )
      return;
    if (current.steps++ > 0) return;
    // First link of a lookup: the graph is still as the read found it.
    const { p, c } = current;
    stats.d.push(Math.min(outDegree(p), inDegree(c)));
    if (armed.get(c) !== passOf.get(c)) {
      armed.set(c, passOf.get(c));
      for (let e = c.firstIn; e !== null; e = e.nextIn) {
        slots.arm.set(e.from, e);
        stats.armStores++;
      }
    }
    if (edgeOf(p, c) !== null) {
      stats.withEdge++;
      for (const name of ["lookup", "every", "arm"])
        if (hit(slots[name], p, c)) {
          stats.hits[name]++;
          current.hits.push(name);
        }
    }
  });

  return {
    report() {
      finish();
      const d = [...stats.d].sort((a, b) => a - b);
      const per = [...stats.perLookup].sort((a, b) => a - b);
      const rate = (n) =>
        stats.withEdge === 0 ? null : +(n / stats.withEdge).toFixed(3);
      const mean = stats.lookups === 0 ? 0 : stats.links / stats.lookups;
      // One slot check per lookup; a hit skips the links of that lookup.
      const withSlot = (name, extra) =>
        +(
          (stats.lookups + stats.links - stats.saved[name] + extra) /
          Math.max(1, stats.reads)
        ).toFixed(3);
      return {
        reads: stats.reads,
        lookups: stats.lookups,
        lookupShare: +(stats.lookups / Math.max(1, stats.reads)).toFixed(4),
        linksPerRead: +(stats.links / Math.max(1, stats.reads)).toFixed(3),
        linksPerLookup: {
          mean: +mean.toFixed(2),
          p50: percentile(per, 0.5),
          p90: percentile(per, 0.9),
          p99: percentile(per, 0.99),
          max: per.at(-1) ?? null,
        },
        minDegree: {
          p50: percentile(d, 0.5),
          p90: percentile(d, 0.9),
          p95: percentile(d, 0.95),
          p99: percentile(d, 0.99),
          max: d.at(-1) ?? null,
        },
        slotHitRate: {
          lookup: rate(stats.hits.lookup),
          every: rate(stats.hits.every),
          arm: rate(stats.hits.arm),
        },
        linksPerReadWithSlot: {
          lookup: withSlot("lookup", 0),
          arm: withSlot("arm", stats.armStores),
        },
      };
    },
    stop() {
      finish();
      rt.setRuntimeProjectionObserver(undefined);
      globalThis.__reflexTrackRead = undefined;
    },
  };
}

const results = {};
const measure = (name, setup) => {
  const step = setup();
  // Warm-up: every consumer has completed passes before measuring.
  for (let i = 0; i < 64; i++) step(i);
  const probe = createProbe();
  try {
    for (let i = 64; i < 64 + STEPS; i++) step(i);
  } finally {
    probe.stop();
  }
  results[name] = probe.report();
};

for (const [name, options] of Object.entries(longLongModes))
  measure(name, () => longLong(rt, options));

for (const workload of workloads) {
  if (workload.level === "E") continue;
  try {
    measure(workload.id, () => workload.setup(rt).step);
  } catch (error) {
    results[workload.id] = { error: String(error) };
  }
}

const row = (name, r) =>
  r.error
    ? `| ${name} | error: ${r.error} |`
    : `| ${name} | ${r.reads} | ${(r.lookupShare * 100).toFixed(2)}% | ${r.linksPerRead} | ${r.linksPerLookup.mean} / ${r.linksPerLookup.p99} | ${r.minDegree.p50 ?? "-"} / ${r.minDegree.p90 ?? "-"} / ${r.minDegree.p95 ?? "-"} / ${r.minDegree.p99 ?? "-"} / ${r.minDegree.max ?? "-"} | ${r.slotHitRate.lookup ?? "-"} / ${r.slotHitRate.every ?? "-"} / ${r.slotHitRate.arm ?? "-"} | ${r.linksPerReadWithSlot.arm} |`;
console.log(
  "| workload | reads | lookups | links/read | links/lookup mean / p99 | D p50 / p90 / p95 / p99 / max | slot hit lookup / every / arm | links/read, arm slot |",
);
console.log("| --- | ---: | ---: | ---: | ---: | --- | --- | ---: |");
for (const [name, r] of Object.entries(results)) console.log(row(name, r));
if (out) writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
