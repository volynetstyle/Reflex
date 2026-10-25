// Semantic differential of two runtime builds over oracle programs, written
// for the reconciliation policy change "preserve the unvisited suffix until
// cleanup" (2026-10-25).
//
//   node perf/structural-retention/differential.mjs
//        [--base <spec>] [--candidate <spec>] [--programs 20000]
//        [--targeted 20000] [--show 3] [--show-kind event-order]
//
// <spec> is `<ref>` or `<ref>+<variant>` with a variant of
// perf/tracking-ladder/variants.mjs; both sides are production bundles
// (scripts/build-baseline-oracle.mjs --production --readable). Defaults:
// base HEAD^ (eager detachment), candidate HEAD. `--candidate HEAD+eager-detach`
// checks that the counterfactual reproduces the old policy exactly.
//
// Every program runs on both sides with invariant checks. Trace pairs are
// classified by classifyTraceDifference (test/oracle/program.ts; see
// SEMANTIC_CONTRACT "Semantic and representation equivalence"):
// identical, list-order, event-order (representation) or semantic. Semantic
// differences, and candidate invariant violations the base does not have,
// are printed and fail the run.
//
// Programs come from the oracle generators and from a targeted generator of
// wide consumers (>= 32 dependencies) whose conditional reads insert a
// dependency in front, in the middle or at the end, with sibling watchers on
// shared producers: the stock generator reaches a long unvisited suffix
// behind a new dependency in about 1 program in 8,000.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  classifyTraceDifference,
  generateHubProgram,
  generateProgram,
  interpret,
  prng,
} from "../../test/oracle/program.ts";
import { variants } from "../tracking-ladder/variants.mjs";

const packageRoot = path.resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args[at + 1];
};
const BASE = option("--base", "HEAD^");
const CANDIDATE = option("--candidate", "HEAD");
const PROGRAMS = Number(option("--programs", 20000));
const TARGETED = Number(option("--targeted", 20000));
const SHOW = Number(option("--show", 3));
const SHOW_KIND = option("--show-kind");

function build(spec) {
  const [ref, ...names] = spec.split("+");
  const sha = execFileSync("git", ["rev-parse", ref], {
    cwd: packageRoot,
    encoding: "utf8",
  }).trim();
  const mutations = names.flatMap((name) => {
    assert.ok(variants[name], `unknown variant ${name}`);
    return variants[name];
  });
  const out = path.join(
    packageRoot,
    ".cache/structural-retention",
    [sha.slice(0, 12), ...names].join("+"),
  );
  execFileSync(
    process.execPath,
    [
      "scripts/build-baseline-oracle.mjs",
      "--commit",
      sha,
      "--production",
      "--readable",
      "--out",
      out,
      ...mutations.flatMap((m) => ["--mutate", m]),
    ],
    { cwd: packageRoot, stdio: "pipe" },
  );
  return import(pathToFileURL(path.join(out, "runtime.mjs")).href);
}

const base = await build(BASE);
const candidate = await build(CANDIDATE);

/**
 * Wide consumers over `width` producers. Each reads a toggle-dependent extra
 * producer in front, in the middle or at the end, so a toggle write makes the
 * next pass meet a new dependency before (or after) a long unvisited suffix.
 * Watchers read the wide consumers and some of the same producers directly,
 * so subscriber order on shared producers is observable.
 */
function generateTargetedProgram(seed) {
  const random = prng(seed);
  const int = (n) => Math.floor(random() * n);
  const width = 34 + int(14);
  const producers = width + 4; // data, then a toggle and three extras
  const toggle = width;
  const extras = [width + 1, width + 2, width + 3];
  const consumers = [];
  const wide = 1 + int(3);
  for (let c = 0; c < wide; c++) {
    const reads = [];
    for (let k = 0; k < width; k++) reads.push({ node: k, mode: "lazy" });
    const where = int(3);
    const extra = {
      node: extras[int(3)],
      mode: "lazy",
      when: { producer: toggle, parity: int(2) },
    };
    if (where === 0) reads.unshift(extra);
    else if (where === 1) reads.splice(int(width), 0, extra);
    else reads.push(extra);
    consumers.push({
      reads,
      ...(random() < 0.3
        ? { reverseWhen: { producer: extras[int(3)], parity: int(2) } }
        : {}),
    });
  }
  const watchers = [];
  const nWatchers = 2 + int(3);
  for (let w = 0; w < nWatchers; w++) {
    const reads = [{ node: producers + int(wide), mode: "lazy" }];
    for (let k = 0; k < 2; k++)
      reads.push({ node: int(producers), mode: "lazy" });
    watchers.push({ reads });
  }
  const ops = [];
  const total = 20 + int(20);
  for (let i = 0; i < total; i++) {
    const r = random();
    if (r < 0.3) ops.push({ kind: "write", producer: toggle, value: int(4) });
    else if (r < 0.55)
      ops.push({ kind: "write", producer: int(producers), value: int(5) });
    else if (r < 0.75) ops.push({ kind: "flush" });
    else if (r < 0.85)
      ops.push({ kind: "read", node: producers + int(wide), mode: "lazy" });
    else if (r < 0.92) ops.push({ kind: "run", watcher: int(nWatchers) });
    else ops.push({ kind: "snapshot" });
  }
  ops.push({ kind: "flush" }, { kind: "snapshot" });
  return { spec: { host: "claim", producers, consumers, watchers }, ops };
}

const results = {};
const shown = [];
let failures = 0;
const invariants = (trace) => trace.filter((e) => e.startsWith("invariant:"));

function run(label, seed, program) {
  const a = interpret(base, program, "strict", { invariants: true });
  const b = interpret(candidate, program, "strict", { invariants: true });
  const kind = classifyTraceDifference(a, b);
  const row = (results[label] ??= {
    programs: 0,
    identical: 0,
    "list-order": 0,
    "event-order": 0,
    semantic: 0,
    "new invariant violations": 0,
  });
  row.programs++;
  row[kind]++;
  const accepted = new Set(invariants(a));
  const fresh = invariants(b).some((entry) => !accepted.has(entry));
  if (fresh) row["new invariant violations"]++;
  if (kind === "semantic" || fresh) failures++;
  if (
    (kind === "semantic" || fresh || kind === SHOW_KIND) &&
    shown.length < SHOW
  ) {
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    shown.push({
      program: `${label}:${seed}`,
      kind,
      at: i,
      base: a.slice(Math.max(0, i - 2), i + 4),
      candidate: b.slice(Math.max(0, i - 2), i + 4),
    });
  }
}

for (let seed = 0; seed < PROGRAMS; seed++) {
  const hub = seed % 5 === 4;
  run(
    hub ? "oracle-hub" : "oracle",
    seed,
    hub ? generateHubProgram(seed) : generateProgram(seed),
  );
}
for (let seed = 0; seed < TARGETED; seed++)
  run("targeted", seed, generateTargetedProgram(seed));

console.log(`base ${BASE} vs candidate ${CANDIDATE}`);
console.table(results);
for (const item of shown) console.log(JSON.stringify(item, null, 1));
assert.equal(failures, 0, `${failures} semantic differences or new violations`);
