// Transparency oracle for tape evidence under nested evaluation (MODEL §10).
// Each scenario builds the same graph twice and runs one pass π of an outer
// consumer with a nested evaluation ν either inside π ("nested") or before
// it ("hoisted"); ν commutes with π semantically by construction. The
// evidence trace of π (and of ν's own consumer) is compared:
//   transparent   identical traces
//   bounded       identical once a lost cell's exact search is read as the
//                 cell hit it replaced (legal slot reuse, P3)
//   VIOLATION     anything else
//   node perf/pathology/oracle/transparency.mjs <instrumented bundle dir>
import path from "node:path";
import { pathToFileURL } from "node:url";

const rt = await import(
  pathToFileURL(path.resolve(process.argv[2], "runtime.mjs")).href
);

const log = [];
let recording = false;
globalThis.__ev = (kind, consumer, stamp) => {
  if (recording) log.push({ kind, consumer, stamp });
};

const range = (n) => Array.from({ length: n }, (_, i) => i);
function permutation(n, seed) {
  const order = range(n);
  let s = seed >>> 0 || 1;
  for (let i = n - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
function subscribe(nodes, count, read = rt.readProducer) {
  for (let c = 0; c < count; c++) {
    const node = rt.createConsumer(() => {
      let t = 0;
      for (const p of nodes) t += read(p);
      return t;
    });
    rt.readConsumer(node);
  }
}
/** A consumer re-reading `ps` in a fresh order each pass of `tick`. */
function shuffler(ps, tick, seed, at = -1, nested = null) {
  const perms = range(4).map((k) => permutation(ps.length, seed + k));
  return rt.createConsumer(() => {
    const order = perms[rt.readProducer(tick) & 3];
    let t = 0;
    for (let i = 0; i < order.length; i++) {
      t += rt.readProducer(ps[order[i]]);
      if (i === at && nested !== null) t += nested();
    }
    return t;
  });
}

const N = 512;

// A world: N producers, 16 readers, a main shuffler, 16 readers, a far
// peer shuffler (outside the finger window), 8 readers. The peer is re-tracked before the main one each step, so the main
// consumer's cells are overwritten and every pass strikes and prepares.
function world(seed, at = -1, nested = null) {
  const P = range(N).map((i) => rt.createProducer(i));
  subscribe(P, 16);
  const tick = rt.createProducer(0);
  const main = shuffler(P, tick, seed, at, nested);
  rt.readConsumer(main);
  subscribe(P, 16);
  const peer = shuffler(P, tick, seed + 50);
  rt.readConsumer(peer);
  subscribe(P, 8);
  return {
    main,
    tick,
    pass: () => rt.readConsumer(peer) + rt.readConsumer(main),
  };
}

// Each scenario: (mode) => { op(), subjects: { name: node } }. In both
// modes the peer of π runs first; ν then runs either inside π (nested, at
// read `at`) or right before it (hoisted).
function nestedScenario({ at, context, quiet }) {
  return (mode) => {
    const ctxB = context ? rt.createRuntimeContext() : null;
    const inB = (fn) => (ctxB ? rt.runWithRuntimeContext(ctxB, fn) : fn());
    const B = inB(() => {
      if (!quiet) return world(101);
      const p = rt.createProducer(1);
      const c = rt.createConsumer(() => rt.readProducer(p) + 1);
      rt.readConsumer(c);
      return { main: c, tick: rt.createProducer(0), pass: () => rt.readConsumer(c) };
    });
    const nu = () => inB(B.pass);
    const A = world(7, at, mode === "nested" ? nu : null);
    let step = 0;
    return {
      subjects: quiet ? { pi: A.main } : { pi: A.main, nu: B.main },
      op() {
        step++;
        inB(() => rt.writeProducer(B.tick, step));
        rt.writeProducer(A.tick, step);
        // A.pass reads A's peer, then A's main consumer (π).
        if (mode === "hoisted") {
          return nu() + A.pass();
        }
        return A.pass();
      },
    };
  };
}

const scenarios = {
  // ν: another runtime context re-tracks a disjoint graph that strikes,
  // after π's first strike (read 2) or after π prepared (read N/2).
  "domain-striking@0": nestedScenario({ at: 0, context: true }),
  "domain-striking@1": nestedScenario({ at: 1, context: true }),
  "domain-striking@2": nestedScenario({ at: 2, context: true }),
  "domain-striking@256": nestedScenario({ at: N >> 1, context: true }),
  // Control: ν in another context reads one clean narrow consumer.
  "domain-quiet": nestedScenario({ at: N >> 1, context: true, quiet: true }),
  // ν: the same, in the same context.
  "same-context@2": nestedScenario({ at: 2, context: false }),
  "same-context@256": nestedScenario({ at: N >> 1, context: false }),

  // ν: the recomputation of dirty computeds π reads (E3). Hoisted: they are
  // pulled clean before π. Expected: bounded, not transparent.
  "dirty-computeds": (mode) => {
    const tickC = rt.createProducer(0);
    const shared = range(4).map((i) => rt.createProducer(i));
    subscribe(shared, 8);
    const cs = range(N).map((i) =>
      rt.createConsumer(
        () =>
          rt.readProducer(tickC) +
          rt.readProducer(shared[i & 3]) +
          rt.readProducer(shared[(i + 1) & 3]) +
          i,
      ),
    );
    for (const c of cs) rt.readConsumer(c);
    subscribe(cs, 16, rt.readConsumer);
    const tickA = rt.createProducer(0);
    const perms = range(4).map((k) => permutation(N, 7 + k));
    const a = rt.createConsumer(() => {
      const order = perms[rt.readProducer(tickA) & 3];
      let t = 0;
      for (let i = 0; i < N; i++) t += rt.readConsumer(cs[order[i]]);
      return t;
    });
    rt.readConsumer(a);
    subscribe(cs, 8, rt.readConsumer);
    let step = 0;
    return {
      subjects: { pi: a },
      op() {
        step++;
        rt.writeProducer(tickC, step);
        rt.writeProducer(tickA, step);
        let v = 0;
        if (mode === "hoisted") for (const c of cs) v += rt.readConsumer(c);
        return rt.readConsumer(a);
      },
    };
  },
};

function traceOf(node) {
  return log
    .filter((e) => e.consumer === node)
    .map((e) => e.kind);
}

function run(build, mode) {
  const s = build(mode);
  let value;
  for (let i = 0; i < 3; i++) value = s.op();
  log.length = 0;
  recording = true;
  value = s.op();
  recording = false;
  const traces = {};
  for (const [name, node] of Object.entries(s.subjects))
    traces[name] = traceOf(node);
  return { value, traces };
}

const count = (xs) =>
  Object.entries(xs.reduce((m, k) => ((m[k] = (m[k] ?? 0) + 1), m), {}))
    .map(([k, v]) => `${k}:${v}`)
    .join(" ");
const same = (x, y) => x.length === y.length && x.every((k, i) => k === y[i]);
const normalize = (xs) =>
  xs.map((k) => (k === "exact-fallback" || k === "cell-hit" ? "hint-hit" : k));

console.log("| scenario | trace | verdict | nested | hoisted |");
console.log("|---|---|---|---|---|");
for (const [name, build] of Object.entries(scenarios)) {
  const n = run(build, "nested");
  const h = run(build, "hoisted");
  if (n.value !== h.value) {
    console.log(`| ${name} | value | SEMANTIC ${n.value} vs ${h.value} | | |`);
    continue;
  }
  for (const subject of Object.keys(n.traces)) {
    const x = n.traces[subject];
    const y = h.traces[subject];
    const verdict = same(x, y)
      ? "transparent"
      : same(normalize(x), normalize(y))
        ? "bounded"
        : "VIOLATION";
    console.log(
      `| ${name} | ${subject === "pi" ? "π (outer)" : "ν (nested)"} | ${verdict} | ${count(x) || "—"} | ${count(y) || "—"} |`,
    );
  }
}
