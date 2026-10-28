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
// classified by classifyTraceDifference (testkit/oracle/program.ts; see
// SEMANTIC_CONTRACT "Semantic and representation equivalence"):
// identical, list-order, event-order (representation) or semantic. Semantic
// differences, and candidate invariant violations the base does not have,
// are printed and fail the run.
//
// Programs come from the oracle generators and from a targeted generator of
// wide consumers (>= 32 dependencies) whose conditional reads insert a
// dependency in front, in the middle or at the end, with sibling watchers on
// shared producers (testkit/oracle/families.ts, family `targeted`): the stock
// generator reaches a long unvisited suffix behind a new dependency in about
// 1 program in 8,000. `pnpm rt diff --policy representation` runs the same
// comparison over any families.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  classifyTraceDifference,
  generateHubProgram,
  generateProgram,
  interpret,
} from "../../testkit/oracle/program.ts";
import { generateTargetedProgram } from "../../testkit/oracle/families.ts";
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
