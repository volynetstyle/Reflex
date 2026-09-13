import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { replay, eventSummary, checkCounts } from "./model.mjs";
const [workload, dimension] = process.argv.slice(2),
  D = Number(dimension);
const names = [
  "R",
  "S",
  "A",
  "L",
  "U",
  "M",
  "B",
  "incomingPointerWrites",
  "outgoingPointerWrites",
  "endpointPointerWrites",
];
const cost = (globalThis.__rotationCost = Object.fromEntries(
  names.map((k) => [k, 0]),
));
const reset = () => {
  for (const k of names) cost[k] = 0;
};
const capture = () => ({
  ...cost,
  W:
    cost.incomingPointerWrites +
    cost.outgoingPointerWrites +
    cost.endpointPointerWrites,
});
const apis = {};
for (const v of ["move", "rotate"])
  for (const m of ["structural", "timing"])
    apis[`${v}-${m}`] = await import(`./results/${v}-${m}.mjs`);
function make(api, structural) {
  const {
    createProducer,
    createConsumer,
    readProducer,
    readConsumer,
    writeProducer,
  } = api;
  const tick = -1,
    base = Array.from({ length: D }, (_, i) => i),
    group2 = base.map((i) => i + D),
    x = 2 * D + 1,
    y = 2 * D + 2;
  const nodes = new Map(
    [tick, ...base, ...group2, x, y].map((id) => [
      id,
      createProducer(id === tick ? 0 : 1),
    ]),
  );
  const idByNode = new Map([...nodes].map(([id, node]) => [node, id]));
  let seed = 0x91e10da5;
  const rand = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed >>> 0;
  };
  const permutations = Array.from({ length: 64 }, () => {
    const a = base.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = rand() % (i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  });
  const shifted = (k) => {
    if (!D) return base;
    const n = ((k % D) + D) % D;
    return [...base.slice(n), ...base.slice(0, n)];
  };
  const traces = Array.from({ length: 64 }, (_, pass) => {
    let deps = base;
    if (workload === "alternating") deps = [pass & 1 ? x : y, ...base];
    else if (workload === "replacement") deps = pass & 1 ? group2 : base;
    else if (workload === "reorder") deps = permutations[pass];
    else if (workload === "local-swap" && pass & 1) {
      deps = base.slice();
      if (D >= 2) [deps[0], deps[1]] = [deps[1], deps[0]];
    } else if (workload === "cyclic-left1" || workload === "failure-retry")
      deps = shifted(pass);
    else if (workload === "cyclic-left2") deps = shifted(2 * pass);
    else if (workload === "cyclic-right1") deps = shifted(-pass);
    else if (workload === "insert-front") deps = pass & 1 ? [x, ...base] : base;
    return [tick, ...deps];
  });
  const cyclic = workload.startsWith("cyclic-") || workload === "failure-retry";
  const traceFor = (pass) =>
    cyclic
      ? [
          tick,
          ...shifted(
            workload === "cyclic-right1"
              ? -pass
              : workload === "cyclic-left2"
                ? 2 * pass
                : pass,
          ),
        ]
      : traces[pass % traces.length];
  const graphTraces = traces.map((t) => t.map((id) => nodes.get(id)));
  let pass = 0,
    fail = false;
  const failure = new Error("injected failure");
  const read = structural
    ? (n) => {
        cost.R++;
        return readProducer(n);
      }
    : readProducer;
  const baseNodes = base.map((id) => nodes.get(id));
  const node = createConsumer(
    cyclic
      ? () => {
          read(nodes.get(tick));
          let sum = 0;
          const k =
            workload === "cyclic-right1"
              ? -pass
              : workload === "cyclic-left2"
                ? 2 * pass
                : pass;
          let index = D ? ((k % D) + D) % D : 0;
          for (let i = 0; i < D; i++) {
            sum += read(baseNodes[index]);
            if (++index === D) index = 0;
            if (fail && i === 0) {
              fail = false;
              throw failure;
            }
          }
          return sum;
        }
      : () => {
          const t = graphTraces[pass % traces.length];
          let sum = 0;
          for (let i = 0; i < t.length; i++) {
            const v = read(t[i]);
            if (i !== 0) sum += v;
            if (fail && i === 1) {
              fail = false;
              throw failure;
            }
          }
          return sum;
        },
  );
  readConsumer(node);
  const canFail = workload === "failure-retry" && D >= 2;
  function step() {
    pass++;
    fail = canFail;
    writeProducer(nodes.get(tick), pass);
    try {
      return readConsumer(node);
    } catch (e) {
      if (e !== failure) throw e;
      return readConsumer(node);
    }
  }
  function snapshot() {
    const ids = [],
      edges = new Map();
    let prev = null;
    for (let e = node.firstIn; e; e = e.nextIn) {
      assert.equal(e.prevIn, prev);
      assert.equal(e.to, node);
      assert.equal(e.from.firstOut, e);
      assert.equal(e.from.lastOut, e);
      assert.equal(e.prevOut, null);
      assert.equal(e.nextOut, null);
      assert(!edges.has(e.from));
      edges.set(e.from, e);
      ids.push(idByNode.get(e.from));
      prev = e;
    }
    assert.equal(node.lastIn, prev);
    assert.equal(node.tailIn, prev);
    assert.deepEqual(ids, traceFor(pass));
    for (const n of nodes.values())
      if (!edges.has(n)) {
        assert.equal(n.firstOut, null);
        assert.equal(n.lastOut, null);
      }
    return { ids, edges };
  }
  return {
    step,
    snapshot,
    trace: () => traceFor(pass),
    initial: traceFor(0),
    canFail,
    expected: () => (cyclic ? D : traces[pass % traces.length].length - 1),
  };
}
function structural(api, variant) {
  const g = make(api, true);
  let prev = g.snapshot(),
    order = prev.ids,
    delta = 0,
    eligible = 0,
    retained = 0;
  const totals = Object.fromEntries([...names, "W"].map((k) => [k, 0])),
    events = [];
  const passes = 16;
  for (let i = 0; i < passes; i++) {
    reset();
    assert.equal(g.step(), g.expected());
    const actual = capture();
    let predicted = { A: 0, L: 0, U: 0, M: 0, B: 0, W: 0 };
    if (g.canFail) {
      const failed = replay(order, g.trace(), variant, 2);
      order = failed.order;
      events.push(...failed.events);
      for (const k of Object.keys(predicted)) predicted[k] += failed.counts[k];
    }
    const result = replay(order, g.trace(), variant);
    order = result.order;
    events.push(...result.events);
    for (const k of Object.keys(predicted)) predicted[k] += result.counts[k];
    checkCounts(actual, predicted);
    assert.equal(actual.R, g.trace().length + (g.canFail ? 2 : 0));
    const next = g.snapshot();
    assert.deepEqual(order, next.ids);
    for (const [source, e] of prev.edges) {
      if (next.edges.has(source)) {
        eligible++;
        if (next.edges.get(source) === e) retained++;
      } else delta++;
    }
    for (const source of next.edges.keys())
      if (!prev.edges.has(source)) delta++;
    for (const k of Object.keys(totals)) totals[k] += actual[k];
    prev = next;
  }
  return {
    perOperation: Object.fromEntries(
      Object.entries(totals).map(([k, v]) => [k, v / passes]),
    ),
    Delta: delta / passes,
    stableEligible: eligible / passes,
    stableRetained: retained / passes,
    attemptsPerOperation: g.canFail ? 2 : 1,
    diagnostics: eventSummary(events),
    passes,
  };
}
const result = { workload, D };
for (const v of ["move", "rotate"])
  result[v] = { structural: structural(apis[`${v}-structural`], v) };
const graphs = Object.fromEntries(
  ["move", "rotate"].map((v) => [v, make(apis[`${v}-timing`], false)]),
);
let sink = 0;
function batch(g, n) {
  const start = performance.now();
  for (let i = 0; i < n; i++) sink += g.step();
  return performance.now() - start;
}
for (const g of Object.values(graphs)) {
  const end = performance.now() + 70;
  while (performance.now() < end) batch(g, 32);
}
let count = 32;
while (batch(graphs.move, count) < 15 && count < 1048576) count *= 2;
const samples = { move: [], rotate: [] };
for (let i = 0; i < 15; i++)
  for (const v of i & 1 ? ["rotate", "move"] : ["move", "rotate"]) {
    globalThis.gc?.();
    samples[v].push((batch(graphs[v], count) * 1e6) / count);
  }
function stats(a) {
  const sorted = a.slice().sort((x, y) => x - y),
    mean = a.reduce((a, b) => a + b, 0) / a.length,
    variance = a.reduce((s, x) => s + (x - mean) ** 2, 0) / (a.length - 1),
    q = (p) => {
      const i = (sorted.length - 1) * p,
        k = Math.floor(i);
      return sorted[k] + (sorted[Math.ceil(i)] - sorted[k]) * (i - k);
    };
  return {
    mean,
    median: q(0.5),
    p75: q(0.75),
    p95: q(0.95),
    p99: q(0.99),
    variance,
    rme95Percent: ((2.145 * Math.sqrt(variance / a.length)) / mean) * 100,
    opsPerSecond: 1e9 / mean,
    wallTimeMs: (a.reduce((a, b) => a + b, 0) * count) / 1e6,
    batchIterations: count,
    samples: a,
  };
}
for (const v of ["move", "rotate"]) {
  result[v].timing = stats(samples[v]);
  assert.equal(graphs[v].step(), graphs[v].expected());
  graphs[v].snapshot();
}
assert(Number.isFinite(sink));
result.timeRatio = result.rotate.timing.mean / result.move.timing.mean;
console.log(JSON.stringify(result));
