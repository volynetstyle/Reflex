// Outgoing-finger accounting: which tier answers every read, what the pair
// lookup compares, and where the looked-up edge sits relative to the
// producer's slot, for the base revision and the finger variants.
//
//   node perf/outgoing-finger/analyze.mjs [--variants base,next,...]
//        [--commit HEAD|source] [--passes 512] [--warmup 256]
//        [--reads shuffle] [--schedules forward,reverse,random]
//        [--deps 128] [--consumers 128] [--gaps 0]
//        [--ladder <rung parts> [--fanouts 3,128]] [--workloads <parts>|all]
//        [--lab <patterns> [--observers pull,watchers] [--lab-deps 256]
//         [--lab-consumers 128]]
//        [--out <file.json>]
//
// Cases: scripts/tracking-outgoing-locality.mjs (read × schedule × deps ×
// consumers × gap; `--reads none` for none), optionally ladder rungs
// (scripts/tracking-ladder.mjs), the timed workloads of bench/workloads.mjs
// (one step per pass) and the end-to-end long × long of
// scripts/tracking-lab-long-long.mjs (one step per selector write; λ is not
// measured there, its reads do not pass through the harness).
//
// Every variant is a PROFILE bundle of `--commit` with
// perf/outgoing-finger/variants/<variant>.findEdge.ts overlaid (`base` is the
// commit itself) and one analysis-only hook at the entries of the locate
// stage, as perf/tracking-ladder/analyze.mjs. Every lookup is replayed on
// the graph as the hook sees it, by a model of that variant's
// findEdgeInLockstep; the run fails unless the model reproduces the bundle's
// compared links (`tracking.locate.step`) and found/absent outcome of every
// lookup. Links count every edge compared on either list, finger probes
// included; the exact hint probe is a slot load and is not a link.
//
// Measured beside the tiers, exactly (they change no state):
//   slot+1, slot−1, slot+2, slot±4, slot±16
//              for a lookup that finds an edge while the producer's slot holds
//              one of its outgoing edges: the found edge is that many
//              nextOut (+) or prevOut (−) steps from the slot.
//   λ+, λ−     for every read (any tier) of a producer by a consumer other
//              than its previous reader: the pair's edge is the nextOut (+)
//              or prevOut (−) neighbour of the previous reader's edge. The
//              ideal finger's hit rate, with a slot refreshed on every read
//              (not a policy: it would store on the L0 path).
//
// Tiers: L0 consumer side; L1 producer side (empty, newest, sole, head
// start); L1h exact hint; L1f a fixed finger probe; L2+/L2− lockstep found /
// absent; F+/F− the finger-anchored lockstep (cyclic, bidir) found / absent.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  ladder,
  ladderCases,
  selects,
} from "../../../../scripts/tracking-ladder.mjs";
import {
  labCases,
  labLongLong,
} from "../../../../scripts/tracking-lab-long-long.mjs";
import {
  localityCases,
  outgoingLocality,
} from "../../../../scripts/tracking-outgoing-locality.mjs";
import { workloads } from "../../bench/workloads.mjs";
import { variantArgs } from "./variants.mjs";

const packageRoot = path.resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args[at + 1];
};
const numbers = (name, fallback) =>
  option(name, fallback).split(",").map(Number);
const PASSES = Number(option("--passes", 512));
const WARMUP = Number(option("--warmup", 256));
const commit = option("--commit", "HEAD");
const variantNames = option("--variants", "base,next").split(",");
const out = option("--out");
// Extra build mutations (`<file>::<search>::<replace>`), for qualifying the
// replay: a mutant whose lookup the model does not describe must fail.
const extraMutations = args
  .map((arg, i) => (arg === "--mutate" ? args[i + 1] : undefined))
  .filter(Boolean);

const LOCATE = "const newest = producer.lastOut;";
const REORDERED =
  "if (newest !== null && newest.to === consumer) return newest;";
const HEAD_START = 2;

function buildVariant(name) {
  const outDir = path.join(
    packageRoot,
    ".cache/oracle/outgoing-finger-profile",
    name,
  );
  execFileSync(
    process.execPath,
    [
      "scripts/build-baseline-oracle.mjs",
      ...(commit === "source" ? ["--source"] : ["--commit", commit]),
      "--profile",
      "--out",
      outDir,
      ...variantArgs(name),
      ...extraMutations.flatMap((m) => ["--mutate", m]),
      "--mutate",
      `src/kernel/stages/tracking/locate.ts::${LOCATE}::globalThis.__reflexFingerLocate?.(producer, consumer, back, ahead); ${LOCATE}`,
      "--mutate",
      `src/kernel/stages/tracking/locate.ts::${REORDERED}::globalThis.__reflexFingerLocate?.(producer, consumer, back, ahead, true); ${REORDERED}`,
    ],
    { cwd: packageRoot, stdio: "pipe" },
  );
  return path.join(outDir, "runtime.mjs");
}

// ---------------------------------------------------------------------------
// Models of findEdgeInLockstep per variant. Each returns
// { route, found, links, side }.

/** The base lockstep from `o` (positioned after the head start). */
function lockstep(P, C, o, back, ahead, r) {
  for (let b = back, a = ahead; ; ) {
    if (o === null) return { ...r, route: "lock-", found: null };
    r.links++;
    if (o.to === C) return { ...r, route: "lock+", found: o, side: "out" };
    o = o.nextOut;
    if (b !== null) {
      r.links++;
      if (b.from === P) return { ...r, route: "lock+", found: b, side: "back" };
      b = b.prevIn;
    }
    if (a !== null) {
      r.links++;
      if (a.from === P)
        return { ...r, route: "lock+", found: a, side: "ahead" };
      a = a.nextIn;
    } else if (b === null) return { ...r, route: "lock-", found: null };
  }
}

function headStartThenLockstep(P, C, back, ahead, r) {
  let o = P.firstOut;
  for (let k = 0; k < HEAD_START; k++) {
    if (o === null) return { ...r, route: "head-absent", found: null };
    r.links++;
    if (o.to === C) return { ...r, route: "head", found: o };
    o = o.nextOut;
  }
  if (o === null) return { ...r, route: "head-absent", found: null };
  return lockstep(P, C, o, back, ahead, r);
}

/** Fixed finger probes `steps` (functions of the slot), then the base path. */
const fixedFinger = (steps) => (P, C, back, ahead) => {
  const r = { links: 0, side: "" };
  const slot = P.tailIn;
  if (slot !== null && slot.from === P) {
    if (slot.to === C) return { ...r, route: "hint", found: slot };
    for (const path of steps) {
      let e = slot;
      let missing = false;
      for (const move of path) {
        e = move(e);
        if (e === null) {
          missing = true;
          break;
        }
      }
      // A probe on a missing neighbour compares nothing; a two-step probe
      // whose first step is missing is skipped with it.
      if (missing) continue;
      r.links++;
      if (e.to === C) return { ...r, route: "finger", found: e };
    }
  }
  return headStartThenLockstep(P, C, back, ahead, r);
};
const N = (e) => e.nextOut;
const Pv = (e) => e.prevOut;

function cyclic(P, C, back, ahead) {
  const r = { links: 0, side: "" };
  const slot = P.tailIn;
  if (slot === null || slot.from !== P)
    return headStartThenLockstep(P, C, back, ahead, r);
  if (slot.to === C) return { ...r, route: "hint", found: slot };
  let o = slot.nextOut ?? P.firstOut;
  for (let b = back, a = ahead; o !== slot; ) {
    r.links++;
    if (o.to === C) return { ...r, route: "F+", found: o, side: "out" };
    o = o.nextOut ?? P.firstOut;
    if (b !== null) {
      r.links++;
      if (b.from === P) return { ...r, route: "F+", found: b, side: "back" };
      b = b.prevIn;
    }
    if (a !== null) {
      r.links++;
      if (a.from === P) return { ...r, route: "F+", found: a, side: "ahead" };
      a = a.nextIn;
    } else if (b === null) return { ...r, route: "F-", found: null };
  }
  return { ...r, route: "F-", found: null };
}

function bidir(P, C, back, ahead) {
  const r = { links: 0, side: "" };
  const slot = P.tailIn;
  if (slot === null || slot.from !== P)
    return headStartThenLockstep(P, C, back, ahead, r);
  if (slot.to === C) return { ...r, route: "hint", found: slot };
  let f = slot.nextOut;
  let p = slot.prevOut;
  for (let b = back, a = ahead; f !== null || p !== null; ) {
    if (f !== null) {
      r.links++;
      if (f.to === C) return { ...r, route: "F+", found: f, side: "out" };
      f = f.nextOut;
    }
    if (p !== null) {
      r.links++;
      if (p.to === C) return { ...r, route: "F+", found: p, side: "out" };
      p = p.prevOut;
    }
    if (b !== null) {
      r.links++;
      if (b.from === P) return { ...r, route: "F+", found: b, side: "back" };
      b = b.prevIn;
    }
    if (a !== null) {
      r.links++;
      if (a.from === P) return { ...r, route: "F+", found: a, side: "ahead" };
      a = a.nextIn;
    } else if (b === null) return { ...r, route: "F-", found: null };
  }
  return { ...r, route: "F-", found: null };
}

function zigzag(P, C, back, ahead) {
  const r = { links: 0, side: "" };
  const slot = P.tailIn;
  if (slot === null || slot.from !== P)
    return headStartThenLockstep(P, C, back, ahead, r);
  if (slot.to === C) return { ...r, route: "hint", found: slot };
  let f = slot.nextOut;
  let p = slot.prevOut;
  let forward = true;
  for (let b = back, a = ahead; ; ) {
    let o;
    if (f !== null && (forward || p === null)) {
      o = f;
      f = f.nextOut;
    } else if (p !== null) {
      o = p;
      p = p.prevOut;
    } else return { ...r, route: "F-", found: null };
    forward = !forward;
    r.links++;
    if (o.to === C) return { ...r, route: "F+", found: o, side: "out" };
    if (b !== null) {
      r.links++;
      if (b.from === P) return { ...r, route: "F+", found: b, side: "back" };
      b = b.prevIn;
    }
    if (a !== null) {
      r.links++;
      if (a.from === P) return { ...r, route: "F+", found: a, side: "ahead" };
      a = a.nextIn;
    } else if (b === null) return { ...r, route: "F-", found: null };
  }
}

/** The ring walk from `slot` (the ring variants' findEdgeAroundOutgoingFinger). */
function ringWalk(P, C, slot, back, ahead, r) {
  let f = slot.nextOut ?? P.firstOut;
  let p = slot.prevOut ?? P.lastOut;
  if (f === slot) return { ...r, route: "F-", found: null };
  for (let b = back, a = ahead, forward = true; ; forward = !forward) {
    r.links++;
    if (forward) {
      if (f.to === C) return { ...r, route: "F+", found: f, side: "out" };
      if (f === p) return { ...r, route: "F-", found: null };
      f = f.nextOut ?? P.firstOut;
    } else {
      if (p.to === C) return { ...r, route: "F+", found: p, side: "out" };
      if (p === f) return { ...r, route: "F-", found: null };
      p = p.prevOut ?? P.lastOut;
    }
    if (b !== null) {
      r.links++;
      if (b.from === P) return { ...r, route: "F+", found: b, side: "back" };
      b = b.prevIn;
    }
    if (a !== null) {
      r.links++;
      if (a.from === P) return { ...r, route: "F+", found: a, side: "ahead" };
      a = a.nextIn;
    } else if (b === null) return { ...r, route: "F-", found: null };
  }
}

function ring(P, C, back, ahead) {
  const r = { links: 0, side: "" };
  const slot = P.tailIn;
  if (slot === null || slot.from !== P)
    return headStartThenLockstep(P, C, back, ahead, r);
  if (slot.to === C) return { ...r, route: "hint", found: slot };
  return ringWalk(P, C, slot, back, ahead, r);
}

/** Base exact probe and head start, then the ring walk with a finger. */
function ringHead(P, C, back, ahead) {
  const r = { links: 0, side: "" };
  const slot = P.tailIn;
  if (slot !== null && slot.to === C && slot.from === P)
    return { ...r, route: "hint", found: slot };
  let o = P.firstOut;
  for (let k = 0; k < HEAD_START; k++) {
    if (o === null) return { ...r, route: "head-absent", found: null };
    r.links++;
    if (o.to === C) return { ...r, route: "head", found: o };
    o = o.nextOut;
  }
  if (o === null) return { ...r, route: "head-absent", found: null };
  return slot !== null && slot.from === P
    ? ringWalk(P, C, slot, back, ahead, r)
    : lockstep(P, C, o, back, ahead, r);
}

/** Up to two ring probes on each side of the finger, then base. */
function ringR2(P, C, back, ahead) {
  const r = { links: 0, side: "" };
  const slot = P.tailIn;
  if (slot !== null && slot.from === P) {
    if (slot.to === C) return { ...r, route: "hint", found: slot };
    let f = slot.nextOut ?? P.firstOut;
    let p = slot.prevOut ?? P.lastOut;
    for (let radius = 0; radius < 2 && f !== slot; radius++) {
      r.links++;
      if (f.to === C) return { ...r, route: "finger", found: f };
      r.links++;
      if (p.to === C) return { ...r, route: "finger", found: p };
      f = f.nextOut ?? P.firstOut;
      p = p.prevOut ?? P.lastOut;
    }
  }
  return headStartThenLockstep(P, C, back, ahead, r);
}

/** Base exact probe and head start, then ±radius ring probes, then base. */
const headRing = (radius) => (P, C, back, ahead) => {
  const r = { links: 0, side: "" };
  const slot = P.tailIn;
  if (slot !== null && slot.to === C && slot.from === P)
    return { ...r, route: "hint", found: slot };
  let o = P.firstOut;
  for (let k = 0; k < HEAD_START; k++) {
    if (o === null) return { ...r, route: "head-absent", found: null };
    r.links++;
    if (o.to === C) return { ...r, route: "head", found: o };
    o = o.nextOut;
  }
  if (o === null) return { ...r, route: "head-absent", found: null };
  if (slot !== null && slot.from === P) {
    let f = slot.nextOut ?? P.firstOut;
    let p = slot.prevOut ?? P.lastOut;
    for (let k = 0; k < radius; k++) {
      r.links++;
      if (f.to === C) return { ...r, route: "finger", found: f };
      r.links++;
      if (p.to === C) return { ...r, route: "finger", found: p };
      f = f.nextOut ?? P.firstOut;
      p = p.prevOut ?? P.lastOut;
    }
  }
  return lockstep(P, C, o, back, ahead, r);
};

/** Base exact probe and head start; with a finger, the first `budget`
 * lockstep steps take their outgoing link from the ring around it. */
const lockBudget = (budget) => (P, C, back, ahead) => {
  const r = { links: 0, side: "" };
  const slot = P.tailIn;
  if (slot !== null && slot.to === C && slot.from === P)
    return { ...r, route: "hint", found: slot };
  let o = P.firstOut;
  for (let k = 0; k < HEAD_START; k++) {
    if (o === null) return { ...r, route: "head-absent", found: null };
    r.links++;
    if (o.to === C) return { ...r, route: "head", found: o };
    o = o.nextOut;
  }
  if (o === null) return { ...r, route: "head-absent", found: null };
  if (slot === null || slot.from !== P)
    return lockstep(P, C, o, back, ahead, r);
  let f = slot.nextOut ?? P.firstOut;
  let p = slot.prevOut ?? P.lastOut;
  let b = back;
  let a = ahead;
  for (let k = 0; k < budget; k++) {
    r.links++;
    if ((k & 1) === 0) {
      if (f.to === C) return { ...r, route: "finger", found: f };
      f = f.nextOut ?? P.firstOut;
    } else {
      if (p.to === C) return { ...r, route: "finger", found: p };
      p = p.prevOut ?? P.lastOut;
    }
    if (b !== null) {
      r.links++;
      if (b.from === P) return { ...r, route: "lock+", found: b, side: "back" };
      b = b.prevIn;
    }
    if (a !== null) {
      r.links++;
      if (a.from === P)
        return { ...r, route: "lock+", found: a, side: "ahead" };
      a = a.nextIn;
    } else if (b === null) return { ...r, route: "lock-", found: null };
  }
  return lockstep(P, C, o, b, a, r);
};

/** As lockBudget, but the budget steps alternate the outgoing link between
 * the finger ring and the base walk from the head start. */
const mixBudget = (budget) => (P, C, back, ahead) => {
  const r = { links: 0, side: "" };
  const slot = P.tailIn;
  if (slot !== null && slot.to === C && slot.from === P)
    return { ...r, route: "hint", found: slot };
  let o = P.firstOut;
  for (let k = 0; k < HEAD_START; k++) {
    if (o === null) return { ...r, route: "head-absent", found: null };
    r.links++;
    if (o.to === C) return { ...r, route: "head", found: o };
    o = o.nextOut;
  }
  if (o === null) return { ...r, route: "head-absent", found: null };
  if (slot === null || slot.from !== P)
    return lockstep(P, C, o, back, ahead, r);
  let f = slot.nextOut ?? P.firstOut;
  let p = slot.prevOut ?? P.lastOut;
  let b = back;
  let a = ahead;
  for (let k = 0; k < 2 * budget; k++) {
    r.links++;
    if ((k & 1) === 1) {
      if (o === null) return { ...r, route: "race-", found: null };
      if (o.to === C) return { ...r, route: "race+", found: o, side: "out" };
      o = o.nextOut;
    } else if ((k & 2) === 0) {
      if (f.to === C) return { ...r, route: "finger", found: f };
      f = f.nextOut ?? P.firstOut;
    } else {
      if (p.to === C) return { ...r, route: "finger", found: p };
      p = p.prevOut ?? P.lastOut;
    }
    if (b !== null) {
      r.links++;
      if (b.from === P) return { ...r, route: "race+", found: b, side: "back" };
      b = b.prevIn;
    }
    if (a !== null) {
      r.links++;
      if (a.from === P)
        return { ...r, route: "race+", found: a, side: "ahead" };
      a = a.nextIn;
    } else if (b === null) return { ...r, route: "race-", found: null };
  }
  return lockstep(P, C, o, b, a, r);
};

const models = {
  "mix-b2": mixBudget(2),
  "mix-b4": mixBudget(4),
  "mix-b6": mixBudget(6),
  "mix-b8": mixBudget(8),
  "mix-b12": mixBudget(12),
  "mix-b16": mixBudget(16),
  "mix-b24": mixBudget(24),
  "head-r4": headRing(4),
  "head-r8": headRing(8),
  "lock-b4": lockBudget(4),
  "lock-b8": lockBudget(8),
  "lock-b16": lockBudget(16),
  "head-r1": headRing(1),
  "head-r2": headRing(2),
  "head-r3": headRing(3),
  ring,
  "ring-head": ringHead,
  "ring-r2": ringR2,
  "ring-exact": ring,
  // The working tree when it carries the production candidate, mix-b8
  // (--commit source).
  candidate: mixBudget(8),
  zigzag,
  base: (P, C, back, ahead) => {
    const r = { links: 0, side: "" };
    const slot = P.tailIn;
    if (slot !== null && slot.to === C && slot.from === P)
      return { ...r, route: "hint", found: slot };
    return headStartThenLockstep(P, C, back, ahead, r);
  },
  next: fixedFinger([[N]]),
  "next-prev": fixedFinger([[N], [Pv]]),
  next2: fixedFinger([[N], [N, N]]),
  cyclic,
  bidir,
};
const modelOf = (name) => models[name.split("+")[0]];
for (const name of variantNames)
  if (modelOf(name) === undefined) throw new Error(`unknown variant ${name}`);

/** The locate stage (locate.ts) in front of findEdgeInLockstep. */
function replay(model, P, C, back, ahead, reordered) {
  const newest = P.lastOut;
  if (reordered) {
    if (newest !== null && newest.to === C)
      return { route: "newest", found: newest, links: 0 };
  } else {
    if (newest === null) return { route: "empty", found: null, links: 0 };
    if (newest.to === C) return { route: "newest", found: newest, links: 0 };
    if (newest === P.firstOut) return { route: "sole", found: null, links: 0 };
  }
  return model(P, C, back, ahead);
}

/** Steps from the slot to `found` along `move`, up to `limit`. */
function slotDistance(slot, found, move, limit) {
  let e = slot;
  for (let d = 1; d <= limit; d++) {
    e = move(e);
    if (e === null) return Infinity;
    if (e === found) return d;
  }
  return Infinity;
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
  finger: "L1f",
  "lock+": "L2+",
  "lock-": "L2-",
  "F+": "F+",
  "F-": "F-",
  "race+": "F+",
  "race-": "F-",
};
const LEVELS = ["L0", "L1", "L1h", "L1f", "L2+", "L2-", "F+", "F-"];
const SLOT_BUCKETS = ["+1", "-1", "+2", "±4", "±16"];

function account(rt, model, step) {
  const s = {
    reads: 0,
    lookups: 0,
    links: 0,
    levels: Object.fromEntries(LEVELS.map((l) => [l, 0])),
    routes: {},
    slotFound: 0,
    slot: Object.fromEntries(SLOT_BUCKETS.map((b) => [b, 0])),
    lambda: { reads: 0, next: 0, prev: 0 },
  };
  let read = null;
  const close = () => {
    if (read === null) return;
    const route = read.tier ?? read.locate?.route;
    if (route === undefined) throw new Error("read with no tier and no lookup");
    const keyed = read.locate?.side ? `${route}:${read.locate.side}` : route;
    s.routes[keyed] = (s.routes[keyed] ?? 0) + 1;
    s.levels[LEVEL[route]]++;
    const l = read.locate;
    if (l) {
      if (l.links !== read.steps)
        throw new Error(
          `model compared ${l.links} links, the bundle ${read.steps} (${l.route})`,
        );
      const found = read.commit === "duplicate" || read.commit === "reuse";
      if (found !== (l.found !== null))
        throw new Error(
          `model ${l.route} disagrees with commit ${read.commit}`,
        );
      s.lookups++;
      s.links += l.links;
    }
    read = null;
  };
  globalThis.__reflexFingerLocate = (P, C, back, ahead, reordered) => {
    if (read.locate) throw new Error("two lookups in one read");
    const slot = P.tailIn;
    read.locate = replay(model, P, C, back, ahead, reordered === true);
    const found = read.locate.found;
    if (
      found !== null &&
      slot !== null &&
      slot.from === P &&
      slot !== found &&
      read.locate.route !== "newest"
    ) {
      s.slotFound++;
      const fwd = slotDistance(slot, found, N, 16);
      const bwd = slotDistance(slot, found, Pv, 16);
      if (fwd === 1) s.slot["+1"]++;
      if (bwd === 1) s.slot["-1"]++;
      if (fwd <= 2) s.slot["+2"]++;
      if (Math.min(fwd, bwd) <= 4) s.slot["±4"]++;
      if (Math.min(fwd, bwd) <= 16) s.slot["±16"]++;
    }
  };
  rt.setRuntimeProjectionObserver(({ id }) => {
    if (id === "projection.semantic.tracking.resolve") {
      close();
      s.reads++;
      read = { tier: undefined, locate: null, commit: undefined, steps: 0 };
      return;
    }
    if (read === null) return;
    if (id === "projection.semantic.tracking.locate.step") read.steps++;
    else if (id in TIER_OF_EVENT) read.tier = TIER_OF_EVENT[id];
    else if (id in COMMIT_OF_EVENT) read.commit = COMMIT_OF_EVENT[id];
  });

  // λ: the ideal finger, from the read sequence itself.
  const lastReader = new Map();
  const edgeOf = (P, C) => {
    for (let e = P.firstOut; e !== null; e = e.nextOut)
      if (e.to === C) return e;
    return null;
  };
  const observeRead = (P, C) => {
    const previous = lastReader.get(P);
    lastReader.set(P, C);
    if (previous === undefined || previous === C) return;
    const e = edgeOf(P, previous);
    if (e === null) return;
    s.lambda.reads++;
    if (e.nextOut?.to === C) s.lambda.next++;
    if (e.prevOut?.to === C) s.lambda.prev++;
  };

  return {
    run(from, count) {
      measuring = observeRead;
      try {
        for (let i = from; i < from + count; i++) step(i);
        close();
      } finally {
        measuring = null;
      }
    },
    stop() {
      rt.setRuntimeProjectionObserver(undefined);
      globalThis.__reflexFingerLocate = undefined;
    },
    stats: s,
  };
}

// Reads go through a wrapper so the λ accounting sees every (P, C).
let measuring = null;
const wrap = (rt) => ({
  ...rt,
  resolveTrackedRead(P, C) {
    measuring?.(P, C);
    rt.resolveTrackedRead(P, C);
  },
});

const ladderSpec = option("--ladder");
const workloadSpec = option("--workloads");
const labSpec = option("--lab");
const cases = [
  ...(labSpec === undefined
    ? []
    : labCases({
        patterns: labSpec === "all" ? "" : labSpec,
        observers: option("--observers", "pull,watchers"),
        deps: numbers("--lab-deps", "256"),
        consumers: numbers("--lab-consumers", "128"),
      }).map((c) => ({ id: c.id, make: (rt) => labLongLong(rt, c) }))),
  ...(option("--reads") === "none"
    ? []
    : localityCases({
        reads: option("--reads", "shuffle"),
        schedules: option("--schedules", "forward,reverse,random"),
        deps: numbers("--deps", "128"),
        consumers: numbers("--consumers", "128"),
        gaps: numbers("--gaps", "0"),
      }).map((c) => ({
        id: c.id,
        make: (rt) => outgoingLocality(wrap(rt), c),
      }))),
  ...(ladderSpec === undefined
    ? []
    : ladderCases({
        rungs: ladderSpec === "all" ? "" : ladderSpec,
        fanouts: numbers("--fanouts", "3,128"),
      }).map((c) => ({
        id: `ladder:${c.id}`,
        make: (rt) => ladder(wrap(rt), c.name, c),
      }))),
  ...(workloadSpec === undefined
    ? []
    : workloads
        .filter(
          (w) =>
            w.level !== "E" &&
            (workloadSpec === "all" || selects(workloadSpec, w.id)),
        )
        .map((w) => ({ id: w.id, make: (rt) => w.setup(rt).step }))),
];

const fixed = (x, digits = 2) => +x.toFixed(digits);
const results = {};
for (const name of variantNames) {
  const rt = await import(pathToFileURL(buildVariant(name)).href);
  for (const c of cases) {
    const step = c.make(rt);
    for (let i = 0; i < WARMUP; i++) step(i);
    const probe = account(rt, modelOf(name), step);
    try {
      probe.run(WARMUP, PASSES);
    } finally {
      probe.stop();
    }
    const s = probe.stats;
    if (s.reads === 0) continue;
    (results[c.id] ??= {})[name] = {
      readsPerPass: fixed(s.reads / PASSES, 1),
      levels: Object.fromEntries(
        LEVELS.map((l) => [l, fixed(s.levels[l] / s.reads, 4)]),
      ),
      routes: Object.fromEntries(
        Object.entries(s.routes)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => [k, fixed(v / PASSES, 2)]),
      ),
      linksPerRead: fixed(s.links / s.reads, 3),
      linksPerLookup: s.lookups ? fixed(s.links / s.lookups, 2) : 0,
      lookupsPerPass: fixed(s.lookups / PASSES, 2),
      slot: Object.fromEntries(
        SLOT_BUCKETS.map((b) => [
          b,
          s.slotFound ? fixed(s.slot[b] / s.slotFound, 3) : null,
        ]),
      ),
      slotFoundPerPass: fixed(s.slotFound / PASSES, 2),
      lambda: s.lambda.reads
        ? {
            next: fixed(s.lambda.next / s.lambda.reads, 3),
            prev: fixed(s.lambda.prev / s.lambda.reads, 3),
          }
        : null,
    };
  }
}

const pct = (x) => (x === 0 ? "·" : `${(x * 100).toFixed(x < 0.01 ? 1 : 0)}`);
console.log(
  `| case | variant | L0 % | L1 % | L1h % | L1f % | L2+ % | L2− % | F+ % | F− % | links/read | lookups/pass | links/lookup | slot+1 / −1 / +2 / ±4 / ±16 (of ${"found with slot"}) | λ+ / λ− |`,
);
console.log(
  "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |",
);
for (const [id, byVariant] of Object.entries(results)) {
  for (const [name, r] of Object.entries(byVariant)) {
    const lv = r.levels;
    const slot = r.slotFoundPerPass
      ? `${SLOT_BUCKETS.map((b) => pct(r.slot[b])).join(" / ")} (${r.slotFoundPerPass}/pass)`
      : "·";
    const lambda = r.lambda
      ? `${pct(r.lambda.next)} / ${pct(r.lambda.prev)}`
      : "·";
    console.log(
      `| ${id} | ${name} | ${LEVELS.map((l) => pct(lv[l])).join(" | ")} | ${r.linksPerRead} | ${r.lookupsPerPass} | ${r.linksPerLookup} | ${slot} | ${lambda} |`,
    );
  }
}
if (out)
  writeFileSync(
    out,
    `${JSON.stringify({ commit, passes: PASSES, warmup: WARMUP, results }, null, 2)}\n`,
  );
