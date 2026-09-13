import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

const [workload, size] = process.argv.slice(2);
const D = Number(size);
const names = [
  "linksTraversed",
  "edgeAllocations",
  "edgeLinks",
  "edgeUnlinks",
  "edgeMoves",
  "callbackDependencyReads",
];
const counters = (globalThis.__suffixCounters = Object.fromEntries(
  names.map((n) => [n, 0]),
));
const reset = () => {
  for (const n of names) counters[n] = 0;
};
const apis = {};
for (const variant of ["before", "after"])
  for (const mode of ["structural", "timing"])
    apis[`${variant}-${mode}`] = await import(
      `./results/${variant}-${mode}.mjs`
    );

function make(api, structural) {
  const {
    createProducer,
    createConsumer,
    readProducer,
    readConsumer,
    writeProducer,
  } = api;
  const tick = createProducer(0);
  const stable = Array.from({ length: D }, (_, i) => createProducer(i + 1));
  const groups = [
    Array.from({ length: D }, (_, i) => createProducer(i + 1)),
    Array.from({ length: D }, (_, i) => createProducer(i + 1)),
  ];
  const alternates = [createProducer(7), createProducer(7)];
  let seed = 0x91e10da5;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed >>> 0;
  };
  const permutations = Array.from({ length: 64 }, () => {
    const a = stable.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = random() % (i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  });
  const read = structural
    ? (node) => {
        counters.callbackDependencyReads++;
        return readProducer(node);
      }
    : readProducer;
  const trace = (pass) =>
    workload === "replacement"
      ? groups[pass & 1]
      : workload === "reorder"
        ? permutations[pass & 63]
        : stable;
  let pass = 0;
  const node = createConsumer(() => {
    read(tick);
    let sum = workload === "alternating" ? read(alternates[pass & 1]) : 0;
    const sources = trace(pass);
    for (let i = 0; i < sources.length; i++) sum += read(sources[i]);
    return sum;
  });
  const expected = (D * (D + 1)) / 2 + (workload === "alternating" ? 7 : 0);
  assert.equal(readConsumer(node), expected);
  function step() {
    ++pass;
    writeProducer(tick, pass);
    return readConsumer(node);
  }
  function snapshot() {
    const bySource = new Map();
    let prev = null;
    for (let edge = node.firstIn; edge !== null; edge = edge.nextIn) {
      assert.equal(edge.prevIn, prev);
      assert.equal(edge.to, node);
      assert(!bySource.has(edge.from));
      assert.equal(edge.from.firstOut, edge);
      assert.equal(edge.from.lastOut, edge);
      assert.equal(edge.prevOut, null);
      assert.equal(edge.nextOut, null);
      bySource.set(edge.from, edge);
      prev = edge;
    }
    assert.equal(node.lastIn, prev);
    assert.equal(node.tailIn, prev);
    const expectedSources = [
      tick,
      ...(workload === "alternating" ? [alternates[pass & 1]] : []),
      ...trace(pass),
    ];
    assert.deepEqual([...bySource.keys()], expectedSources);
    for (const source of [...stable, ...groups[0], ...groups[1], ...alternates])
      if (!bySource.has(source)) {
        assert.equal(source.firstOut, null);
        assert.equal(source.lastOut, null);
      }
    return bySource;
  }
  return { step, snapshot, expected };
}
function structural(api) {
  const g = make(api, true);
  let prev = g.snapshot(),
    stableEligible = 0,
    stableRetained = 0,
    semanticDelta = 0;
  reset();
  for (let i = 0; i < 16; i++) {
    assert.equal(g.step(), g.expected);
    const next = g.snapshot();
    for (const [source, edge] of prev) {
      if (next.has(source)) {
        stableEligible++;
        if (next.get(source) === edge) stableRetained++;
      } else semanticDelta++;
    }
    for (const source of next.keys()) if (!prev.has(source)) semanticDelta++;
    prev = next;
  }
  const result = Object.fromEntries(names.map((n) => [n, counters[n] / 16]));
  return {
    ...result,
    stableEdgesEligible: stableEligible / 16,
    stableEdgesRetained: stableRetained / 16,
    dependencyDelta: semanticDelta / 16,
    physicalMutations: result.edgeLinks + result.edgeUnlinks + result.edgeMoves,
  };
}
const results = {};
for (const variant of ["before", "after"])
  results[variant] = { structural: structural(apis[`${variant}-structural`]) };
const graphs = Object.fromEntries(
  ["before", "after"].map((v) => [v, make(apis[`${v}-timing`], false)]),
);
let sink = 0;
function batch(g, count) {
  const start = performance.now();
  for (let i = 0; i < count; i++) sink += g.step();
  return performance.now() - start;
}
for (const g of Object.values(graphs)) {
  const end = performance.now() + 100;
  while (performance.now() < end) batch(g, 64);
}
let count = 64;
while (batch(graphs.before, count) < 20 && count < 1048576) count *= 2;
const samples = { before: [], after: [] };
for (let sample = 0; sample < 15; sample++) {
  for (const variant of sample % 2
    ? ["after", "before"]
    : ["before", "after"]) {
    globalThis.gc?.();
    samples[variant].push((batch(graphs[variant], count) * 1e6) / count);
  }
}
function stats(a) {
  const sorted = a.slice().sort((x, y) => x - y),
    mean = a.reduce((s, x) => s + x, 0) / a.length;
  const variance = a.reduce((s, x) => s + (x - mean) ** 2, 0) / (a.length - 1);
  const q = (p) => {
    const i = (sorted.length - 1) * p,
      lo = Math.floor(i);
    return sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo);
  };
  return {
    unit: "ns/op",
    mean,
    median: q(0.5),
    p75: q(0.75),
    p95: q(0.95),
    p99: q(0.99),
    variance,
    rme95Percent: ((2.145 * Math.sqrt(variance / a.length)) / mean) * 100,
    opsPerSecond: 1e9 / mean,
    batchIterations: count,
    wallTimeMs: (a.reduce((s, x) => s + x, 0) * count) / 1e6,
    samples: a,
  };
}
for (const v of ["before", "after"]) {
  results[v].timing = stats(samples[v]);
  assert.equal(graphs[v].step(), graphs[v].expected);
  graphs[v].snapshot();
}
assert(Number.isFinite(sink));
console.log(
  JSON.stringify({
    workload,
    D,
    ...results,
    timeRatio: results.after.timing.mean / results.before.timing.mean,
  }),
);
