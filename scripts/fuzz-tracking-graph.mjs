// Graph-level differential fuzz of dependency tracking.
//
//   node scripts/fuzz-tracking-graph.mjs --baseline <commit> [--candidate source|<commit>]
//        [--scenarios 20000] [--seed 1] [--ops 30]
//   node scripts/fuzz-tracking-graph.mjs --baseline <commit> --qualify [--scenarios 20000]
//
// Both sides are production bundles of the internal entry, built by
// packages/reflex-runtime/scripts/build-baseline-oracle.mjs. A scenario is a
// script of operations generated from the seed alone, then executed on each
// side: tracking passes (in order, shuffled, with duplicates of wide hubs,
// new and dropped dependencies, self-reads, reads of a consumer that is
// itself computing), passes nested inside passes, passes that end without
// cleanup as after a throw, single unlinks, source sweeps and disposals.
//
// Each side records a trace: after every read the frontier of the reading
// consumer (`tailIn`: index and source in its incoming list), after every
// operation a signature of the whole graph (incoming order with edge
// identity and stamps, outgoing order). Edge identity is a per-side ordinal
// given to an edge the first time a check sees it, so a replaced edge shows
// as a new ordinal. The traces must be equal entry for entry.
//
// The candidate is also checked against INV-H after every operation and
// every read: a Computing node's tailIn is null or an incoming edge; an idle
// node's is null, an incoming edge, or a hint, which is an outgoing edge of
// the node, not a self-edge, attached to both lists, and never on a Computing
// node or a watcher.
//
// --qualify builds one candidate per seeded mutant of the hint and requires
// each to be detected within the scenario budget.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const packageRoot = path.join(repoRoot, "packages/reflex-runtime");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args[at + 1];
};
const baselineRef = option("--baseline");
const candidateRef = option("--candidate", "source");
const SCENARIOS = Number(option("--scenarios", 20000));
const FIRST_SEED = Number(option("--seed", 1));
const OPS = Number(option("--ops", 30));
const qualify = args.includes("--qualify");
if (baselineRef === undefined)
  throw new Error("--baseline <commit> is required");

const COMPUTING = 1 << 3;
const WATCHER = 1 << 4;

function build(label, ref, mutations = []) {
  const out = path.join(packageRoot, ".cache/fuzz-tracking-graph", label);
  execFileSync(
    process.execPath,
    [
      "scripts/build-baseline-oracle.mjs",
      ...(ref === "source" ? ["--source"] : ["--commit", ref]),
      "--production",
      "--out",
      out,
      ...mutations.flatMap((m) => ["--mutate", m]),
    ],
    { cwd: packageRoot, stdio: "pipe" },
  );
  return path.join(out, "runtime.mjs");
}

// A fresh module instance per run: the tracking clock is module state, and
// both sides must start it at the same value.
let instance = 0;
const load = (file) =>
  import(`${pathToFileURL(file).href}?instance=${++instance}`);

// ---------------------------------------------------------------------------
// Scenario scripts: pure data from the seed.

function prng(seed) {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function generate(seed) {
  const random = prng(seed);
  const int = (n) => Math.floor(random() * n);
  const chance = (p) => random() < p;
  const shape = {
    producers: 12 + int(20),
    consumers: 4 + int(8),
    hubs: 1 + int(4),
    // Static subscribers of each hub, linked once before the script.
    statics: Array.from({ length: 4 }, () => 3 + int(10)),
    watcher: chance(0.5),
  };
  const nodeCount = shape.producers + shape.consumers;
  const consumerId = (i) => shape.producers + i;
  // The previous read order of each consumer, for locality-heavy passes.
  const orders = Array.from({ length: shape.consumers }, () => []);

  const genPass = (c, depth) => {
    const style = random();
    let reads;
    const previous = orders[c];
    if (style < 0.3 && previous.length > 0) {
      // Mostly the previous order, with local moves, drops and inserts.
      reads = [];
      for (const r of previous) {
        if (chance(0.1)) continue;
        if (chance(0.1)) reads.push(int(nodeCount));
        reads.push(r);
      }
      for (let i = 0; i + 1 < reads.length; i++)
        if (chance(0.1)) [reads[i], reads[i + 1]] = [reads[i + 1], reads[i]];
    } else {
      reads = Array.from({ length: int(40) }, () => int(nodeCount));
      if (style < 0.6 && previous.length > 0)
        reads = [...previous, ...reads.slice(0, 5)];
    }
    // Hub duplicates: re-read a hub between other reads.
    if (chance(0.6)) {
      const hub = int(shape.hubs);
      reads = reads.flatMap((r) => (chance(0.5) ? [r, hub] : [r]));
    }
    // Self-reads are rare and exercise the self-edge rules.
    if (chance(0.03)) reads.splice(int(reads.length + 1), 0, consumerId(c));
    orders[c] = [...new Set(reads)];
    const nests = [];
    if (depth < 2 && chance(0.3)) {
      const count = 1 + int(2);
      for (let k = 0; k < count; k++)
        nests.push({
          at: int(reads.length + 1),
          pass: genPass(int(shape.consumers), depth + 1),
        });
    }
    return { consumer: c, reads, nests, cleanup: !chance(0.1) };
  };

  const ops = [];
  for (let i = 0; i < OPS; i++) {
    const r = random();
    if (r < 0.75)
      ops.push({ kind: "pass", pass: genPass(int(shape.consumers), 0) });
    else if (r < 0.85)
      ops.push({
        kind: "unlink",
        consumer: int(shape.consumers),
        nth: int(64),
      });
    else if (r < 0.9)
      ops.push({ kind: "sources", consumer: int(shape.consumers) });
    else if (r < 0.95) ops.push({ kind: "subscribers", node: int(nodeCount) });
    else ops.push({ kind: "dispose", node: int(nodeCount) });
  }
  return { shape, ops };
}

// ---------------------------------------------------------------------------
// Execution: one side, one scenario, one trace.

function execute(rt, scenario, checkHints) {
  const { shape, ops } = scenario;
  const advance = rt.advanceTrackingStamp ?? rt.advanceTrackingEpoch;
  const stampOf = (edge) => edge.stamp ?? edge.version;
  const node = () => new rt.ReactiveNode(undefined, undefined, 0);
  const nodes = [];
  for (let i = 0; i < shape.producers + shape.consumers; i++)
    nodes.push(node());
  const index = new Map(nodes.map((n, i) => [n, i]));
  for (let h = 0; h < shape.hubs; h++)
    for (let s = 0; s < shape.statics[h]; s++) rt.linkEdge(nodes[h], node());
  if (shape.watcher) nodes[shape.producers].state |= WATCHER;

  const trace = [];
  const violations = [];
  const edgeIds = new Map();
  let nextEdgeId = 0;
  const edgeId = (edge) => {
    let id = edgeIds.get(edge);
    if (id === undefined) edgeIds.set(edge, (id = nextEdgeId++));
    return id;
  };
  const incoming = (n) => {
    const list = [];
    for (let e = n.firstIn; e !== null; e = e.nextIn) list.push(e);
    return list;
  };

  const checkTail = (n, where) => {
    const tail = n.tailIn;
    if (tail === null) return;
    for (let e = n.firstIn; e !== null; e = e.nextIn) if (e === tail) return;
    const id = index.get(n) ?? "static";
    if ((n.state & COMPUTING) !== 0) {
      violations.push(
        `${where}: Computing node ${id} has a non-incoming tailIn`,
      );
      return;
    }
    if ((n.state & WATCHER) !== 0) {
      violations.push(`${where}: hint on watcher ${id}`);
      return;
    }
    if (tail.from !== n || tail.to === n) {
      violations.push(
        `${where}: idle tailIn of ${id} is neither incoming nor a hint`,
      );
      return;
    }
    let out = false;
    for (let e = n.firstOut; e !== null; e = e.nextOut)
      if (e === tail) out = true;
    let into = false;
    for (let e = tail.to.firstIn; e !== null; e = e.nextIn)
      if (e === tail) into = true;
    if (!out || !into) violations.push(`${where}: dangling hint on ${id}`);
  };
  const checkAll = (where) => {
    if (!checkHints) return;
    for (const n of nodes) checkTail(n, where);
  };

  const signature = () =>
    nodes
      .map((n) => {
        const ins = incoming(n).map(
          (e) => `${index.get(e.from)}#${edgeId(e)}@${stampOf(e)}`,
        );
        const outs = [];
        for (let e = n.firstOut; e !== null; e = e.nextOut)
          outs.push(index.get(e.to) ?? "s");
        return `${ins}|${outs}`;
      })
      .join(";");

  const runPass = (pass, where) => {
    const consumer = nodes[shape.producers + pass.consumer];
    if ((consumer.state & COMPUTING) !== 0) return; // already on the stack
    consumer.state |= COMPUTING;
    consumer.tailIn = null;
    advance();
    let nest = 0;
    for (let i = 0; i <= pass.reads.length; i++) {
      while (nest < pass.nests.length && pass.nests[nest].at === i) {
        runPass(pass.nests[nest].pass, `${where}/nest`);
        nest++;
      }
      if (i === pass.reads.length) break;
      rt.resolveTrackedRead(nodes[pass.reads[i]], consumer);
      const tail = consumer.tailIn;
      const list = incoming(consumer);
      trace.push(
        `r${pass.consumer}:${tail === null ? "-" : `${list.indexOf(tail)}/${index.get(tail.from)}`}`,
      );
      if (checkHints) checkTail(consumer, `${where} read ${i}`);
    }
    consumer.state &= ~COMPUTING;
    if (pass.cleanup && consumer.tailIn !== consumer.lastIn)
      rt.cleanupUnvisitedSources(consumer);
  };

  try {
    ops.forEach((op, k) => {
      const where = `op ${k} ${op.kind}`;
      if (op.kind === "pass") runPass(op.pass, where);
      else if (op.kind === "unlink") {
        const list = incoming(nodes[shape.producers + op.consumer]);
        if (list.length > 0) rt.unlinkEdge(list[op.nth % list.length]);
      } else if (op.kind === "sources")
        rt.unlinkAllSources(nodes[shape.producers + op.consumer]);
      else if (op.kind === "subscribers")
        rt.unlinkAllSubscribers(nodes[op.node]);
      else rt.disposeNode(nodes[op.node]);
      trace.push(`op${k}:${signature()}`);
      checkAll(where);
    });
  } catch (error) {
    // A corrupted graph can make the runtime throw; that ends the trace.
    trace.push(
      `throw:${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const hints = nodes.filter(
    (n) => n.tailIn !== null && n.tailIn.from === n && n.tailIn.to !== n,
  ).length;
  return { trace, violations, hints };
}

function firstDifference(a, b) {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++)
    if (a[i] !== b[i]) return { index: i, baseline: a[i], candidate: b[i] };
  return null;
}

/** Runs the budget; returns the first failing seed or null, and hint coverage. */
function run(baseline, candidate, scenarios) {
  let hinted = 0;
  for (let seed = FIRST_SEED; seed < FIRST_SEED + scenarios; seed++) {
    const scenario = generate(seed);
    const a = execute(baseline, scenario, false);
    const b = execute(candidate, scenario, true);
    if (b.hints > 0) hinted++;
    const difference = firstDifference(a.trace, b.trace);
    if (difference !== null || b.violations.length > 0)
      return { seed, difference, violation: b.violations[0], hinted };
  }
  return { seed: null, hinted };
}

const baselineFile = build("baseline", baselineRef);

if (!qualify) {
  const baseline = await load(baselineFile);
  const candidate = await load(build("candidate", candidateRef));
  const started = Date.now();
  const result = run(baseline, candidate, SCENARIOS);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (result.seed !== null) {
    console.error(`FAIL at seed ${result.seed} after ${seconds}s`);
    if (result.difference)
      console.error(JSON.stringify(result.difference).slice(0, 2000));
    if (result.violation) console.error(result.violation);
    process.exit(1);
  }
  console.log(
    `${SCENARIOS} scenarios (${OPS} operations each) identical to ${baselineRef}, INV-H held; ` +
      `${result.hinted} scenarios ended with a live hint; ${seconds}s`,
  );
  process.exit(0);
}

// Every hint decision, seeded one at a time.
const F = "src/kernel/shape/graph/findEdge.ts";
const S = "src/kernel/shape/graph/sweepEdges.ts";
const L = "src/kernel/shape/graph/linkEdge.ts";
const T = "src/kernel/stages/tracking/locate.ts";
const ONLY = process.env.FUZZ_MUTANT;
const MUTANTS = [
  [
    "probe-any-consumer",
    `${F}::hint.to === consumer && hint.from === producer::hint.from === producer`,
  ],
  [
    "probe-any-producer",
    `${F}::hint.to === consumer && hint.from === producer::hint.to === consumer`,
  ],
  // The finger race (findEdgeInLockstepFromFinger, which precedes the base
  // lockstep in the file, so a search text shared by both loops mutates the
  // race): only an edge from the producer may start the ring, a finger miss
  // proves nothing, the race hands every walker on to the base lockstep, and
  // nothing but the base guard writes the slot. Where the ring looks and how
  // the walkers interleave decide cost and slot content only, which the trace
  // does not compare; the replay of perf/outgoing-finger/analyze.mjs checks
  // those (README there, "Qualification").
  [
    "finger-any-slot-edge",
    `${F}::    hint !== null && hint.from === producer::    hint !== null`,
  ],
  [
    "finger-incoming-overclaims",
    `${F}::    } else if (back === null) {::    } else {`,
  ],
  [
    "finger-base-hit-dropped",
    `${F}::      if (out.to === consumer) return out;::      if (out.to === consumer) return null;`,
  ],
  [
    "finger-handoff-drops-base-walk",
    `${F}::  return findEdgeInLockstepPastHeadStart(producer, consumer, out, back, ahead);::  return findEdgeInLockstepPastHeadStart(producer, consumer, null, back, ahead);`,
  ],
  [
    "finger-slot-written-early",
    `${F}::      after = after.nextOut ?? producer.firstOut!;::      after = after.nextOut ?? producer.firstOut!; producer.tailIn = after;`,
  ],
  [
    "fill-into-computing",
    `${F}::(producer.state & (Computing | Watcher)) === 0::(producer.state & Watcher) === 0`,
  ],
  [
    "fill-into-watcher",
    `${F}::(producer.state & (Computing | Watcher)) === 0::(producer.state & Computing) === 0`,
  ],
  [
    "keep-on-sequence-unlink",
    `${S}::    if (from.tailIn === edge) from.tailIn = null;::    void 0;`,
  ],
  ["keep-on-subscriber-sweep", `${S}::slotEdge.from === producer::false`],
  [
    "keep-on-unlink-edge",
    `${L}::  if (from.tailIn === edge) from.tailIn = null;::  void 0;`,
  ],
  [
    "locate-overclaims-absence",
    `${T}::if (newest === producer.firstOut) return null;::if (newest.nextOut === null) return null;`,
  ],
  [
    "locate-newest-any-consumer",
    `${T}::if (newest.to === consumer) return newest;::if (newest.from === producer) return newest;`,
  ],
];
let survived = 0;
for (const [id, mutation] of MUTANTS) {
  if (ONLY !== undefined && id !== ONLY) continue;
  const baseline = await load(baselineFile);
  const candidate = await load(build(`mutant-${id}`, "source", [mutation]));
  const result = run(baseline, candidate, SCENARIOS);
  if (result.seed === null) {
    survived++;
    console.log(`${id.padEnd(26)} SURVIVED ${SCENARIOS} scenarios`);
  } else {
    console.log(
      `${id.padEnd(26)} killed at seed ${result.seed} (${result.violation ?? "trace difference " + JSON.stringify(result.difference).slice(0, 300)})`,
    );
  }
}
process.exit(survived === 0 ? 0 : 1);
