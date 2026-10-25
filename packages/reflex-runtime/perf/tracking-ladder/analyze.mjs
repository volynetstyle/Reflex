// Tracking ladder accounting: which tier answers each read of every rung of
// scripts/tracking-ladder.mjs, and what the answer costs in compared links.
//
//   node perf/tracking-ladder/analyze.mjs [--rungs <regex>] [--fanouts 3,128]
//        [--deps 128] [--passes 200] [--commit <ref>] [--variant <name>]
//        [--workloads <regex>] [--out <file.json>]
//
// `--workloads` adds the timed workloads of bench/workloads.mjs that match,
// one step per pass, so the ladder can be read against the reads of the
// benchmark suite.
//
// Builds a PROFILE bundle of the working tree (or of `--commit`) with one
// analysis-only hook at
// the top of locateTrackedEdge (`globalThis.__reflexLadderLocate(producer,
// consumer, back, ahead)`; the source is not changed). Resolve tiers come
// from the PROFILE projection events. A read that reaches locateTrackedEdge
// is replayed from the graph as the hook sees it, before anything moves:
// the producer-side probes, the head start, the hint and the lockstep, with
// the links each side compares. The replay must reproduce the PROFILE count
// of compared links (`tracking.locate.step`) and the found/absent outcome of
// every lookup, or the tool fails; it is a model of the bundle, checked
// against the bundle.
//
// Per lookup the replay also reports
//   opt        the single-side optimum in this representation: for a found
//              edge, min(rank in P.out, distance on the back side, distance on
//              the ahead side); for an absence, min(|P.out|, the uncompared
//              part of C.in). What an oracle choosing the right side for free
//              would compare, with no new state.
//   hint-after the links and probes of the same lookup with the hint
//              consulted after the four-link head start instead of before it
//              (the order before 2026-10-25). The order changes no state (the
//              slot is filled only past the head start, in both orders), so
//              the counterfactual is exact.
//   out-only, in-only
//              for a lookup that reaches the lockstep, the links of the same
//              head start followed by a walk of P.out alone, or of the two
//              incoming walkers alone (in turn). Equally exact: the search
//              strategy changes neither the answer nor the slot fill.
//   pair-ahead, pair-back
//              a two-walk lockstep: P.out in step with one incoming walker
//              that runs the ahead side and then the back side (or the
//              reverse). Still O(min(out, in)) for both answers, two links
//              per step instead of three.
//
// `--variant` adds an attribution mutation from ./variants.mjs whose lookup
// the replay still models.
//
// Tiers: L0 consumer side (next, first edge, cursor, one/two hop, last
// edge); L1 producer side (empty, newest, sole, head start); L1h hint; L2+
// lockstep, edge found; L2- lockstep, absence proved.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { ladder, ladderCases } from "../../../../scripts/tracking-ladder.mjs";
import { workloads } from "../../bench/workloads.mjs";
import { variants } from "./variants.mjs";

const packageRoot = path.resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args[at + 1];
};
const PASSES = Number(option("--passes", 200));
const WARMUP = 64;
const out = option("--out");
const cases = ladderCases({
  rungs: new RegExp(option("--rungs", ".*")),
  fanouts: option("--fanouts", "3,128").split(",").map(Number),
  deps: Number(option("--deps", 128)),
});

const commit = option("--commit");
const variant = option("--variant");
if (variant === "hint-after")
  throw new Error("hint-after is reported as a counterfactual of every run");
if (variant !== undefined && !(variant in variants))
  throw new Error(`unknown variant ${variant}`);
const LOCATE = "const newest = producer.lastOut;";
const outDir = path.join(
  packageRoot,
  ".cache/oracle/tracking-ladder-profile",
  `${commit ?? "working-tree"}${variant ? `-${variant}` : ""}`,
);
execFileSync(
  process.execPath,
  [
    "scripts/build-baseline-oracle.mjs",
    ...(commit ? ["--commit", commit] : ["--source"]),
    "--profile",
    "--out",
    outDir,
    "--mutate",
    `src/kernel/stages/tracking/locate.ts::${LOCATE}::globalThis.__reflexLadderLocate?.(producer, consumer, back, ahead); ${LOCATE}`,
    ...(variant ? variants[variant].flatMap((m) => ["--mutate", m]) : []),
  ],
  { cwd: packageRoot, stdio: "pipe" },
);
const rt = await import(pathToFileURL(path.join(outDir, "runtime.mjs")).href);

const HEAD_START = 4;
const length = (edge, next) => {
  let n = 0;
  for (let e = edge; e !== null; e = next(e)) n++;
  return n;
};
const distance = (edge, next, target) => {
  let n = 1;
  for (let e = edge; e !== null; e = next(e), n++) if (e === target) return n;
  return Infinity;
};
const prevIn = (e) => e.prevIn;
const nextIn = (e) => e.nextIn;
const nextOut = (e) => e.nextOut;

/** Links the two incoming walkers compare, in turn, to reach `found` or to exhaust. */
function inWalk(back, ahead, found) {
  let n = 0;
  for (let b = back, a = ahead; b !== null || a !== null; ) {
    if (b !== null) {
      n++;
      if (b === found) return n;
      b = b.prevIn;
    }
    if (a !== null) {
      n++;
      if (a === found) return n;
      a = a.nextIn;
    }
  }
  return n;
}

/**
 * Links a two-walk lockstep compares past the head start: `out` in step with
 * one incoming walker over ahead then back (`aheadFirst`) or back then ahead.
 */
function pairWalk(C, out, back, ahead, found, aheadFirst) {
  const sides = aheadFirst
    ? [ahead, nextIn, back, prevIn]
    : [back, prevIn, ahead, nextIn];
  let e = sides[0];
  let step = sides[1];
  let second = true;
  const nextCandidate = () => {
    while (e === null && second) {
      second = false;
      e = sides[2];
      step = sides[3];
    }
    const current = e;
    if (current !== null) e = step(current);
    return current;
  };
  let n = 0;
  for (let o = out; ; ) {
    if (o === null) return n;
    n++;
    if (o.to === C) return n;
    o = o.nextOut;
    const candidate = nextCandidate();
    if (candidate === null) return n;
    n++;
    if (candidate === found) return n;
  }
}

/** locateTrackedEdge + findEdgeInLockstep, on the graph as the hook sees it. */
function replay(P, C, back, ahead) {
  const r = {
    route: "",
    found: null,
    head: 0,
    hintProbe: 0,
    out: 0,
    back: 0,
    ahead: 0,
    opt: 0,
    side: "",
    outOnly: 0,
    inOnly: 0,
    pairAhead: 0,
    pairBack: 0,
    hintAfterLinks: 0,
    hintAfterProbe: 0,
  };
  const newest = P.lastOut;
  if (newest === null) return { ...r, route: "empty" };
  if (newest.to === C) return { ...r, route: "newest", found: newest };
  if (newest === P.firstOut) return { ...r, route: "sole" };

  const slot = P.tailIn;
  const hintMatches = slot !== null && slot.to === C && slot.from === P;
  const outLength = length(P.firstOut, nextOut);
  const inLength = length(back, prevIn) + length(ahead, nextIn);
  const finish = (route, found, side = "") => {
    r.route = route;
    r.found = found;
    r.side = side;
    if (route === "lock+" || route === "lock-") {
      r.outOnly =
        found === null ? outLength : distance(P.firstOut, nextOut, found);
      r.inOnly = HEAD_START + inWalk(back, ahead, found);
      r.pairAhead =
        HEAD_START + pairWalk(C, afterHead, back, ahead, found, true);
      r.pairBack =
        HEAD_START + pairWalk(C, afterHead, back, ahead, found, false);
    }
    r.opt =
      found === null
        ? Math.min(outLength, inLength)
        : Math.min(
            distance(P.firstOut, nextOut, found),
            distance(back, prevIn, found),
            distance(ahead, nextIn, found),
          );
    // Hint after the head start: a hit costs the head start up to the
    // edge's rank first; a miss costs the same links, and the probe only
    // when the head start did not settle the lookup.
    if (route === "hint") {
      const rank = distance(P.firstOut, nextOut, slot);
      r.hintAfterLinks = Math.min(rank, HEAD_START);
      r.hintAfterProbe = rank > HEAD_START ? 1 : 0;
    } else {
      r.hintAfterLinks = r.head + r.out + r.back + r.ahead;
      r.hintAfterProbe = route === "lock+" || route === "lock-" ? 1 : 0;
    }
    return r;
  };

  r.hintProbe = 1;
  if (hintMatches) return finish("hint", slot);
  let o = P.firstOut;
  for (let k = 0; k < HEAD_START; k++) {
    if (o === null) return finish("head-absent", null);
    r.head++;
    if (o.to === C) return finish("head", o);
    o = o.nextOut;
  }
  const afterHead = o;
  for (let b = back, a = ahead; ; ) {
    if (o === null) return finish("lock-", null);
    r.out++;
    if (o.to === C) return finish("lock+", o, "out");
    o = o.nextOut;
    if (b !== null) {
      r.back++;
      if (b.from === P) return finish("lock+", b, "back");
      b = b.prevIn;
    }
    if (a !== null) {
      r.ahead++;
      if (a.from === P) return finish("lock+", a, "ahead");
      a = a.nextIn;
    } else if (b === null) return finish("lock-", null);
  }
}

const TIER_OF_EVENT = {
  "projection.semantic.tracking.next.hit": "next",
  "projection.semantic.tracking.initial.first-hit": "first",
  "projection.semantic.tracking.cursor.hit": "cursor",
  "projection.semantic.tracking.initial.create": "create",
  "projection.semantic.tracking.reorder.one-hop": "one-hop",
  "projection.semantic.tracking.reorder.two-hop": "two-hop",
  "projection.semantic.tracking.last-edge.shortcut": "last-edge",
  "projection.semantic.tracking.initial.last-edge-shortcut": "initial-last",
};
const COMMIT_OF_EVENT = {
  "projection.semantic.tracking.prefix.duplicate": "duplicate",
  "projection.semantic.tracking.cursor.append": "append",
  "projection.semantic.tracking.suffix.reuse": "reuse",
  "projection.semantic.tracking.suffix.link-new": "link-new",
};
const LEVEL = {
  next: "L0",
  first: "L0",
  cursor: "L0",
  "one-hop": "L0",
  "two-hop": "L0",
  "last-edge": "L0",
  "initial-last": "L0",
  create: "L1",
  empty: "L1",
  newest: "L1",
  sole: "L1",
  head: "L1",
  "head-absent": "L1",
  hint: "L1h",
  "lock+": "L2+",
  "lock-": "L2-",
};

function account(step) {
  const s = {
    reads: 0,
    routes: {},
    commits: {},
    levels: { L0: 0, L1: 0, L1h: 0, "L2+": 0, "L2-": 0 },
    links: { head: 0, out: 0, back: 0, ahead: 0 },
    hintProbes: 0,
    hintAfter: { links: 0, probes: 0 },
    lockFound: {
      n: 0,
      links: 0,
      opt: 0,
      outOnly: 0,
      inOnly: 0,
      pairAhead: 0,
      pairBack: 0,
      side: { out: 0, back: 0, ahead: 0 },
    },
    lockAbsent: {
      n: 0,
      links: 0,
      opt: 0,
      outOnly: 0,
      inOnly: 0,
      pairAhead: 0,
      pairBack: 0,
    },
    moves: 0,
    detaches: 0,
    cleanupDrops: 0,
  };
  let read = null;
  const close = () => {
    if (read === null) return;
    const route = read.tier ?? read.locate?.route;
    if (route === undefined) throw new Error("read with no tier and no lookup");
    s.routes[route] = (s.routes[route] ?? 0) + 1;
    s.levels[LEVEL[route]]++;
    if (read.commit) s.commits[read.commit] = (s.commits[read.commit] ?? 0) + 1;
    const l = read.locate;
    if (l) {
      const replayed = l.head + l.out + l.back + l.ahead;
      if (replayed !== read.steps)
        throw new Error(
          `replay compared ${replayed} links, the bundle ${read.steps} (${l.route})`,
        );
      const found = read.commit === "duplicate" || read.commit === "reuse";
      if (found !== (l.found !== null))
        throw new Error(
          `replay ${l.route} disagrees with commit ${read.commit}`,
        );
      s.links.head += l.head;
      s.links.out += l.out;
      s.links.back += l.back;
      s.links.ahead += l.ahead;
      s.hintProbes += l.hintProbe;
      if (l.hintProbe) {
        s.hintAfter.links += l.hintAfterLinks;
        s.hintAfter.probes += l.hintAfterProbe;
      } else {
        // Settled before findEdgeInLockstep: identical in both orders.
        s.hintAfter.links += replayed;
      }
      // Totals per lookup, head start included, so that they compare with
      // `opt` and the counterfactual walks.
      if (l.route === "lock+" || l.route === "lock-") {
        const t = l.route === "lock+" ? s.lockFound : s.lockAbsent;
        t.n++;
        t.links += replayed;
        t.opt += l.opt;
        t.outOnly += l.outOnly;
        t.inOnly += l.inOnly;
        t.pairAhead += l.pairAhead;
        t.pairBack += l.pairBack;
        if (l.route === "lock+") t.side[l.side]++;
      }
    }
    read = null;
  };

  globalThis.__reflexLadderLocate = (P, C, back, ahead) => {
    if (read.locate) throw new Error("two lookups in one read");
    read.locate = replay(P, C, back, ahead);
  };
  rt.setRuntimeProjectionObserver(({ id }) => {
    if (id === "projection.semantic.tracking.resolve") {
      close();
      s.reads++;
      read = { tier: undefined, locate: null, commit: undefined, steps: 0 };
      return;
    }
    if (id === "projection.semantic.cleanup.edge.drop") {
      s.cleanupDrops++;
      return;
    }
    if (read === null) return;
    if (id === "projection.semantic.tracking.locate.step") read.steps++;
    else if (id in TIER_OF_EVENT) read.tier = TIER_OF_EVENT[id];
    else if (id in COMMIT_OF_EVENT) read.commit = COMMIT_OF_EVENT[id];
    else if (id === "projection.semantic.tracking.edge.move") s.moves++;
    else if (id === "projection.semantic.tracking.suffix.detach") s.detaches++;
  });

  return {
    run(from, count) {
      for (let i = from; i < from + count; i++) step(i);
      close();
    },
    stop() {
      rt.setRuntimeProjectionObserver(undefined);
      globalThis.__reflexLadderLocate = undefined;
    },
    stats: s,
  };
}

const fixed = (x, digits = 2) => +x.toFixed(digits);
const workloadPattern = option("--workloads");
const measured = [
  ...cases.map((c) => ({ id: c.id, make: () => ladder(rt, c.name, c) })),
  ...(workloadPattern === undefined
    ? []
    : workloads
        .filter(
          (w) => w.level !== "E" && new RegExp(workloadPattern).test(w.id),
        )
        .map((w) => ({ id: w.id, make: () => w.setup(rt).step }))),
];
const results = {};
for (const c of measured) {
  const step = c.make();
  for (let i = 0; i < WARMUP; i++) step(i);
  const probe = account(step);
  try {
    probe.run(WARMUP, PASSES);
  } finally {
    probe.stop();
  }
  const s = probe.stats;
  if (s.reads === 0) continue;
  const links = s.links.head + s.links.out + s.links.back + s.links.ahead;
  const created =
    (s.commits.append ?? 0) +
    (s.commits["link-new"] ?? 0) +
    (s.routes.create ?? 0);
  const l0cMoves =
    (s.routes["one-hop"] ?? 0) +
    (s.routes["two-hop"] ?? 0) +
    (s.routes["last-edge"] ?? 0) +
    (s.routes["initial-last"] ?? 0);
  results[c.id] = {
    readsPerPass: fixed(s.reads / PASSES, 1),
    levels: Object.fromEntries(
      Object.entries(s.levels).map(([k, v]) => [k, fixed(v / s.reads, 4)]),
    ),
    routes: Object.fromEntries(
      Object.entries(s.routes)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => [k, fixed(v / PASSES, 2)]),
    ),
    commitsPerPass: Object.fromEntries(
      Object.entries(s.commits).map(([k, v]) => [k, fixed(v / PASSES, 2)]),
    ),
    linksPerRead: fixed(links / s.reads, 3),
    linksPerPass: {
      head: fixed(s.links.head / PASSES, 1),
      out: fixed(s.links.out / PASSES, 1),
      back: fixed(s.links.back / PASSES, 1),
      ahead: fixed(s.links.ahead / PASSES, 1),
      hintProbes: fixed(s.hintProbes / PASSES, 1),
    },
    lockFound: s.lockFound.n
      ? {
          perPass: fixed(s.lockFound.n / PASSES, 2),
          linksPerEdge: fixed(s.lockFound.links / s.lockFound.n, 2),
          optPerEdge: fixed(s.lockFound.opt / s.lockFound.n, 2),
          outOnlyPerEdge: fixed(s.lockFound.outOnly / s.lockFound.n, 2),
          inOnlyPerEdge: fixed(s.lockFound.inOnly / s.lockFound.n, 2),
          pairAheadPerEdge: fixed(s.lockFound.pairAhead / s.lockFound.n, 2),
          pairBackPerEdge: fixed(s.lockFound.pairBack / s.lockFound.n, 2),
          foundBy: s.lockFound.side,
        }
      : null,
    lockAbsent: s.lockAbsent.n
      ? {
          perPass: fixed(s.lockAbsent.n / PASSES, 2),
          linksPerProof: fixed(s.lockAbsent.links / s.lockAbsent.n, 2),
          optPerProof: fixed(s.lockAbsent.opt / s.lockAbsent.n, 2),
          outOnlyPerProof: fixed(s.lockAbsent.outOnly / s.lockAbsent.n, 2),
          inOnlyPerProof: fixed(s.lockAbsent.inOnly / s.lockAbsent.n, 2),
          pairAheadPerProof: fixed(s.lockAbsent.pairAhead / s.lockAbsent.n, 2),
          pairBackPerProof: fixed(s.lockAbsent.pairBack / s.lockAbsent.n, 2),
        }
      : null,
    newEdgesPerPass: fixed(created / PASSES, 2),
    cleanupDropsPerPass: fixed(s.cleanupDrops / PASSES, 2),
    detachesPerPass: fixed(s.detaches / PASSES, 2),
    movesPerPass: fixed((s.moves + l0cMoves) / PASSES, 2),
    hintAfter: {
      linksPerRead: fixed(s.hintAfter.links / s.reads, 3),
      probesPerRead: fixed(s.hintAfter.probes / s.reads, 3),
      currentProbesPerRead: fixed(s.hintProbes / s.reads, 3),
    },
  };
}

const pct = (x) => (x === 0 ? "·" : `${(x * 100).toFixed(x < 0.01 ? 1 : 0)}`);
console.log(
  "| case | reads/pass | L0 % | L1 % | L1h % | L2+ % | L2− % | links/read | L2+ links/edge (opt) | L2− links/proof (opt) | new edges/pass (cleanup) | moves/pass | hint-after links/read, probes/read (now) |",
);
console.log(
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
);
for (const [id, r] of Object.entries(results)) {
  const lv = r.levels;
  console.log(
    `| ${id} | ${r.readsPerPass} | ${pct(lv.L0)} | ${pct(lv.L1)} | ${pct(lv.L1h)} | ${pct(lv["L2+"])} | ${pct(lv["L2-"])} | ${r.linksPerRead} | ${r.lockFound ? `${r.lockFound.linksPerEdge} (${r.lockFound.optPerEdge})` : "·"} | ${r.lockAbsent ? `${r.lockAbsent.linksPerProof} (${r.lockAbsent.optPerProof})` : "·"} | ${r.newEdgesPerPass} (${r.cleanupDropsPerPass}) | ${r.movesPerPass} | ${r.hintAfter.linksPerRead}, ${r.hintAfter.probesPerRead} (${r.hintAfter.currentProbesPerRead}) |`,
  );
}
console.log(
  "\n| case | L2+ per pass | links/edge: lockstep / pair-ahead / pair-back / out-only / in-only / opt | found by out / back / ahead | L2− per pass | links/proof: lockstep / pair-ahead / pair-back / out-only / in-only / opt |",
);
console.log("| --- | ---: | ---: | ---: | ---: | ---: |");
for (const [id, r] of Object.entries(results)) {
  const f = r.lockFound;
  const a = r.lockAbsent;
  if (!f && !a) continue;
  console.log(
    `| ${id} | ${f ? f.perPass : "·"} | ${f ? `${f.linksPerEdge} / ${f.pairAheadPerEdge} / ${f.pairBackPerEdge} / ${f.outOnlyPerEdge} / ${f.inOnlyPerEdge} / ${f.optPerEdge}` : "·"} | ${f ? `${f.foundBy.out} / ${f.foundBy.back} / ${f.foundBy.ahead}` : "·"} | ${a ? a.perPass : "·"} | ${a ? `${a.linksPerProof} / ${a.pairAheadPerProof} / ${a.pairBackPerProof} / ${a.outOnlyPerProof} / ${a.inOnlyPerProof} / ${a.optPerProof}` : "·"} |`,
  );
}
console.log("\nRoutes per pass:");
for (const [id, r] of Object.entries(results))
  console.log(
    `  ${id.padEnd(24)} ${Object.entries(r.routes)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ")}`,
  );
if (out)
  writeFileSync(
    out,
    `${JSON.stringify({ commit: commit ?? "working-tree", variant: variant ?? null, passes: PASSES, results }, null, 2)}\n`,
  );
