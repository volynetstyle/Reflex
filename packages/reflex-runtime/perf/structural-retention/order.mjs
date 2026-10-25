// Out-of-order resurrection: how much of the retained identity does the
// head-only lazy reactivation actually reuse?
//
//   node perf/structural-retention/order.mjs [--ref HEAD]
//        [--variant lazy-identity-shared-at-drop] [--programs 20000]
//        [--out <file.json>]
//
// Builds a PROFILE bundle of the ref with the variant and analysis-only
// probes (`globalThis.__lz`; the source tree is not changed): computation
// begin and end, every tracked read, head reactivations, links of new edges
// (which abandon the chain) and the lookup's compared links.
//
// For every computation the probe records R0, the retained set at its start.
// A read is *available* when it is the pass's first read of a producer in R0:
// a pair whose identity was retained when the pass began. Each available read
// ends as
//   hit       the chain head matched: reactivated without lookup
//   deeper    the chain was live but its head was another producer; the read
//             paid the lookup and linked a new edge (abandoning the chain)
//   abandoned the chain had already been abandoned by an earlier link in the
//             pass; the read paid the lookup and a new link
// and records the depth of the producer in the live chain at that moment.
//
// η = hits / available is the share of retained identity the mechanism uses.
// Corpora: a cross-epoch ladder (a consumer reads an anchor and N producers,
// each with another subscriber; drops all N for one computation; then reads a
// reordered trace), the oracle generators, and D.list.filter-select.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { workloads as benchWorkloads } from "../../bench/workloads.mjs";
import {
  generateHubProgram,
  generateProgram,
  interpret,
  prng,
} from "../../test/oracle/program.ts";
import { retentionVariants } from "./variants.mjs";

const packageRoot = path.resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args[at + 1];
};
const REF = option("--ref", "HEAD");
const VARIANT = option("--variant", "lazy-identity-shared-at-drop");
const PROGRAMS = Number(option("--programs", 20000));
const OUT = option("--out");

// ---------------------------------------------------------------- build

const probe = (m) =>
  m
    .replace(
      "if (__PROFILE__) globalThis.__srReactivated = (globalThis.__srReactivated | 0) + 1;",
      "globalThis.__lz.hit(consumer, producer);",
    )
    .replace(
      "after.nextIn; to.retainedIn = null;",
      "after.nextIn; globalThis.__lz.link(from, to); to.retainedIn = null;",
    )
    .replace(
      "cursor.nextIn = edge; to.retainedIn = null;",
      "cursor.nextIn = edge; globalThis.__lz.link(from, to); to.retainedIn = null;",
    );
const PROBES = [
  "src/kernel/shape/graph/linkEdge.ts::  to.firstIn = to.lastIn = to.tailIn = edge;::  globalThis.__lz.link(from, to); to.firstIn = to.lastIn = to.tailIn = edge;",
  "src/kernel/stages/tracking/resolve.ts::  const cursorEdge = consumer.tailIn;::  globalThis.__lz.read(producer, consumer); const cursorEdge = consumer.tailIn;",
  "src/kernel/stages/stabilization/advance.ts::  node.tailIn = null;::  globalThis.__lz.begin(node); node.tailIn = null;",
  "src/kernel/engine/watcher.execution.ts::  node.tailIn = null;::  globalThis.__lz.begin(node); node.tailIn = null;",
  "src/kernel/stages/stabilization/advance.ts::  if (node.tailIn !== node.lastIn) {::  globalThis.__lz.end(node); if (node.tailIn !== node.lastIn) {",
  "src/kernel/engine/watcher.execution.ts::  if (node.tailIn !== node.lastIn) {::  globalThis.__lz.end(node); if (node.tailIn !== node.lastIn) {",
];

const sha = execFileSync("git", ["rev-parse", REF], {
  cwd: packageRoot,
  encoding: "utf8",
}).trim();
const mutations = [...retentionVariants[VARIANT].map(probe), ...PROBES];
for (const m of mutations.slice(0, -PROBES.length))
  if (m.includes("__srReactivated"))
    throw new Error("probe did not replace the reactivation counter");
const outDir = path.join(
  packageRoot,
  ".cache/structural-retention/order",
  `${sha.slice(0, 12)}-${VARIANT}`,
);
execFileSync(
  process.execPath,
  [
    "scripts/build-baseline-oracle.mjs",
    "--commit",
    sha,
    "--profile",
    "--out",
    outDir,
    ...mutations.flatMap((m) => ["--mutate", m]),
  ],
  { cwd: packageRoot, stdio: "pipe" },
);

// ---------------------------------------------------------------- shadow

function freshStats() {
  return {
    passesWithChain: 0,
    retainedAtStart: 0,
    available: 0,
    hit: 0,
    deeper: 0,
    abandoned: 0,
    unexpected: 0,
    abandons: 0,
    thrown: 0,
    missedLookupLinks: 0,
    deeperDepth: {},
  };
}
const bucket = (d) => (d <= 1 ? "1" : d <= 3 ? "2-3" : d <= 7 ? "4-7" : "8+");

const lz = {
  stats: freshStats(),
  passes: new Map(),
  current: null,
  finish() {
    const c = this.current;
    if (c === null) return;
    this.current = null;
    const s = this.stats;
    if (c.outcome === "hit") s.hit++;
    else if (c.outcome === "link") {
      s.missedLookupLinks += c.steps;
      if (c.depth > 0) {
        s.deeper++;
        s.deeperDepth[bucket(c.depth)] =
          (s.deeperDepth[bucket(c.depth)] ?? 0) + 1;
      } else s.abandoned++;
    } else s.unexpected++;
  },
  begin(node) {
    this.finish();
    const r0 = new Set();
    for (let e = node.retainedIn; e !== null; e = e.nextIn) r0.add(e.from);
    this.passes.set(node, { r0, seen: new Set() });
    if (r0.size > 0) {
      this.stats.passesWithChain++;
      this.stats.retainedAtStart += r0.size;
    }
  },
  end(node) {
    this.finish();
    this.passes.delete(node);
  },
  read(producer, consumer) {
    this.finish();
    const pass = this.passes.get(consumer);
    if (pass === undefined || !pass.r0.has(producer) || pass.seen.has(producer))
      return;
    pass.seen.add(producer);
    let depth = -1;
    let i = 0;
    for (let e = consumer.retainedIn; e !== null; e = e.nextIn, i++)
      if (e.from === producer) {
        depth = i;
        break;
      }
    this.stats.available++;
    this.current = { producer, consumer, depth, outcome: "none", steps: 0 };
  },
  hit(consumer, producer) {
    const c = this.current;
    if (c !== null && c.consumer === consumer && c.producer === producer)
      c.outcome = "hit";
  },
  link(from, to) {
    if (to.retainedIn !== null && this.passes.has(to)) {
      let length = 0;
      for (let e = to.retainedIn; e !== null; e = e.nextIn) length++;
      this.stats.abandons++;
      this.stats.thrown += length;
    }
    const c = this.current;
    if (c !== null && c.consumer === to && c.producer === from)
      c.outcome = "link";
  },
  step() {
    if (this.current !== null) this.current.steps++;
  },
};
globalThis.__lz = lz;

const rt = await import(pathToFileURL(path.join(outDir, "runtime.mjs")).href);
rt.setRuntimeProjectionObserver(({ id }) => {
  if (id === "projection.semantic.tracking.locate.step") lz.step();
});

function measure(run) {
  lz.stats = freshStats();
  lz.passes.clear();
  lz.current = null;
  run();
  lz.finish();
  const s = lz.stats;
  return {
    ...s,
    eta: s.available === 0 ? null : Number((s.hit / s.available).toFixed(3)),
  };
}

// ---------------------------------------------------------------- corpora

function shuffle(values, seed) {
  const random = prng(seed);
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
const range = (n) => Array.from({ length: n }, (_, i) => i);
const ORDERS = {
  same: (n) => range(n),
  "rotate-left-1": (n) => [...range(n).slice(1), 0],
  "rotate-right-1": (n) => [n - 1, ...range(n - 1)],
  "mid-to-front": (n) => {
    const m = n >> 1;
    return [m, ...range(n).filter((i) => i !== m)];
  },
  "swap-adjacent": (n) => range(n).map((i) => (i % 2 === 0 ? i + 1 : i - 1)),
  reverse: (n) => range(n).reverse(),
  random: (n, seed) => shuffle(range(n), seed),
  "subset-same": (n) => range(n).filter((i) => i % 2 === 0),
  "subset-permuted": (n, seed) =>
    shuffle(
      range(n).filter((i) => i % 2 === 0),
      seed,
    ),
  "novel-front": (n) => [-1, ...range(n)],
  "novel-mid": (n) => {
    const m = n >> 1;
    return [...range(m), -1, ...range(n).slice(m)];
  },
};

function ladderCase(order, n, seed) {
  rt.resetRuntimeContext();
  const phase = rt.createProducer(0);
  const anchor = rt.createProducer(0);
  const deps = range(n).map((i) => rt.createProducer(i));
  for (const d of deps)
    rt.readConsumer(rt.createConsumer(() => rt.readProducer(d)));
  const novel = rt.createProducer(-1);
  const next = ORDERS[order](n, seed);
  const consumer = rt.createConsumer(() => {
    let sum = rt.readProducer(anchor);
    const p = rt.readProducer(phase);
    if (p === 0) for (const d of deps) sum += rt.readProducer(d);
    else if (p === 2)
      for (const k of next) sum += rt.readProducer(k === -1 ? novel : deps[k]);
    return sum;
  });
  rt.readConsumer(consumer);
  rt.writeProducer(phase, 1);
  rt.readConsumer(consumer);
  rt.writeProducer(phase, 2);
  rt.readConsumer(consumer);
}

const ladder = {};
for (const n of [16, 64])
  for (const order of Object.keys(ORDERS)) {
    const seeds =
      order.includes("random") || order.includes("permuted") ? 5 : 1;
    ladder[`${order}/n${n}`] = measure(() => {
      for (let seed = 0; seed < seeds; seed++) ladderCase(order, n, seed);
    });
  }

const oracle = measure(() => {
  for (let seed = 0; seed < PROGRAMS; seed++)
    interpret(
      rt,
      seed % 5 === 4 ? generateHubProgram(seed) : generateProgram(seed),
      "strict",
    );
});

const dlist = measure(() => {
  const { step } = benchWorkloads
    .find((w) => w.id === "D.list.filter-select")
    .setup(rt);
  for (let i = 0; i < 200; i++) step(i);
});

// ---------------------------------------------------------------- report

const table = (rows) => {
  const out = {};
  for (const [id, s] of Object.entries(rows))
    out[id] = {
      retained: s.retainedAtStart,
      available: s.available,
      hit: s.hit,
      deeper: s.deeper,
      abandoned: s.abandoned,
      η: s.eta,
      thrown: s.thrown,
      "lookup links (missed)": s.missedLookupLinks,
    };
  return out;
};
console.log(`commit ${sha.slice(0, 12)} + ${VARIANT}`);
console.log(
  "\ncross-epoch ladder (anchor + N producers, all dropped for one computation)",
);
console.table(table(ladder));
console.log(
  `\noracle corpus (${PROGRAMS} programs) and D.list.filter-select (200 steps)`,
);
console.table(table({ oracle, "D.list.filter-select": dlist }));
console.log(
  "depth of deeper misses, oracle:",
  JSON.stringify(oracle.deeperDepth),
);
if (oracle.unexpected + dlist.unexpected > 0)
  console.log("unexpected outcomes:", oracle.unexpected, dlist.unexpected);
if (OUT !== undefined)
  writeFileSync(
    OUT,
    `${JSON.stringify({ commit: sha, variant: VARIANT, ladder, oracle, dlist }, null, 1)}\n`,
  );
