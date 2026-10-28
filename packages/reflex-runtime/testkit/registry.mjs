// The suite catalog of @volynets/reflex-runtime: every check the package has,
// with the layer it belongs to, the technique it applies, the tiers that run
// it and the budgets it runs with. `pnpm rt list` prints it, `pnpm rt run`
// executes it, `pnpm rt doctor` proves that every test file in test/ is owned
// by exactly one suite (testkit/README.md, "Inventory").
//
// Suite fields:
//   id         layer.name, unique
//   layer      static | unit | model | dev | projection | spec | oracle |
//              qualification | characterization | integration | fuzz | self
//   technique  what kind of evidence the suite produces
//   owner      the document that owns the facts the suite checks
//   files      test files or directories the suite owns (vitest path filters)
//   runner     { type: "vitest", config, cwd? } | { type: "node", args }
//              | { type: "tsc", project? } | { type: "testkit", args }
//              | { type: "pnpm", args } | { type: "prettier" | "eslint" }
//   tiers      smoke | ci | deep: the tiers whose `run` includes the suite
//   budgets    { <tier>: { ENV: value } }: the budget a tier runs it with
//   requires   what must exist before it runs (informational)
//   advisory   true: a failure is reported as `changed` and does not fail the
//              run (behavior the contract leaves open; never a correctness gate)
import { availableParallelism } from "node:os";

/** Tiers, cheapest first. A tier's budgets apply to every suite it runs. */
export const TIERS = {
  smoke: "seconds: pre-commit loop; reduced oracle budgets",
  ci: "minutes: the default; the budgets the vitest suites declare",
  deep: "tens of minutes: release / nightly; 10x budgets, cross-revision diffs, fuzzers",
};

export const LAYERS = {
  static: "properties of the sources and the build, no execution",
  unit: "example-based tests of the documented contract",
  model: "tests against a reference model of recomputation",
  dev: "DEV policy and debug events (development build flags)",
  projection: "structural projections of the propagation stages",
  spec: "differential testing against the executable spec (SpecMachine)",
  oracle: "differential testing against the frozen baseline bundle",
  qualification: "adequacy of the oracles: mutants, holdouts, branch coverage",
  characterization:
    "pinned behavior the contract leaves open: reported, never a correctness verdict",
  integration: "the facade package and the packed artifacts",
  fuzz: "long randomized comparisons across revisions",
  self: "the testkit itself and its controls",
};

const deepJobs = String(Math.max(1, Math.min(8, availableParallelism() >> 1)));
const ORACLE_BUDGETS = {
  smoke: { ORACLE_SEEDS: "300", ORACLE_HUB_SEEDS: "150" },
  deep: { ORACLE_SEEDS: "20000", ORACLE_HUB_SEEDS: "10000" },
};
const source = { type: "vitest", config: "vite.config.ts" };

export const SUITES = [
  // static ------------------------------------------------------------------
  {
    id: "static.typecheck",
    layer: "static",
    technique: "type checking of the sources",
    owner: "tsconfig.json",
    runner: { type: "tsc" },
    tiers: ["ci", "deep"],
  },
  {
    id: "static.typecheck-differential",
    layer: "static",
    technique: "type checking of the differential testkit",
    owner: "test/differential/README.md",
    runner: { type: "tsc", project: "test/differential/tsconfig.json" },
    tiers: ["ci", "deep"],
  },
  {
    id: "static.rules",
    layer: "static",
    technique: "rule citations resolve to code and checks",
    owner: "docs/RULES.md",
    runner: { type: "node", args: ["scripts/check-rules-citations.mjs"] },
    tiers: ["smoke", "ci", "deep"],
  },
  {
    id: "static.architecture",
    layer: "static",
    technique: "layering and debug-boundary contract",
    owner: "docs/architecture-contract.md",
    runner: { type: "node", args: ["scripts/check-architecture-contract.mjs"] },
    tiers: ["smoke", "ci", "deep"],
  },
  {
    id: "static.bundle-identity",
    layer: "static",
    technique: "production bundle byte identity against a revision (HEAD)",
    owner: "docs/GUIDE.md#checks-by-change-kind",
    runner: { type: "node", args: ["scripts/check-bundle-identity.mjs"] },
    tiers: [],
  },
  {
    id: "static.format",
    layer: "static",
    technique: "prettier formatting",
    owner: "AGENTS.md",
    runner: { type: "prettier" },
    tiers: [],
  },
  {
    id: "static.lint",
    layer: "static",
    technique: "eslint",
    owner: "AGENTS.md",
    runner: { type: "eslint" },
    tiers: [],
  },
  {
    id: "static.artifacts",
    layer: "static",
    technique: "built artifact layout and contents",
    owner: "docs/GUIDE.md#checks-by-change-kind",
    runner: {
      type: "node",
      args: ["../../tooling/build/verify-artifacts.mjs", "--directory", "."],
    },
    tiers: [],
    requires: "a build (pnpm build)",
  },

  // unit / model / dev / projection ----------------------------------------
  {
    id: "unit.contracts",
    layer: "unit",
    technique: "examples of the public contract, build contracts",
    owner: "docs/RUNTIME.md",
    files: ["test/runtime/contracts/"],
    runner: source,
    tiers: ["smoke", "ci", "deep"],
  },
  {
    id: "unit.topology",
    layer: "unit",
    technique: "examples and properties of graph shape and walkers",
    owner: "docs/INVARIANTS.md",
    files: ["test/runtime/topology/"],
    runner: source,
    tiers: ["smoke", "ci", "deep"],
  },
  {
    id: "unit.debug",
    layer: "unit",
    technique: "debug trace and subtle API examples",
    owner: "docs/architecture-contract.md",
    files: ["test/runtime/debug/"],
    runner: source,
    tiers: ["smoke", "ci", "deep"],
  },
  // Kernel tests that live under test/differential (its typecheck gate) but
  // do not compare against SpecMachine: their oracle is outside its DSL.
  {
    id: "unit.host-protocol",
    layer: "unit",
    technique:
      "host protocol: batching, settlement and reentrant writes against small independent reference traces",
    owner: "docs/RULES.md",
    files: [
      "test/differential/runtime.batch-boundary.test.ts",
      "test/differential/runtime.reentrant-write.test.ts",
    ],
    runner: source,
    tiers: ["smoke", "ci", "deep"],
  },
  {
    id: "unit.tracking-representation",
    layer: "unit",
    technique:
      "tracking clock and stamps: rewind, wrap and collision, with graph integrity",
    owner: "docs/INVARIANTS.md",
    files: [
      "test/differential/runtime.epoch-collision.test.ts",
      "test/differential/runtime.tracking-stamp.test.ts",
    ],
    runner: source,
    tiers: ["smoke", "ci", "deep"],
  },
  {
    id: "model.recomputation",
    layer: "model",
    technique: "model-based testing against a recomputation model",
    owner: "docs/INVARIANTS.md",
    files: ["test/runtime/model/"],
    runner: source,
    tiers: ["smoke", "ci", "deep"],
  },
  {
    id: "dev.policy",
    layer: "dev",
    technique: "DEV policy, diagnostics and regression examples",
    owner: "docs/RUNTIME.md",
    files: ["test/dev/"],
    runner: { type: "vitest", config: "vite.dev.config.ts" },
    tiers: ["ci", "deep"],
  },
  {
    id: "projection.stages",
    layer: "projection",
    technique: "structural projections of the stages",
    owner: "src/kernel/stages/README.md",
    files: ["test/projection/"],
    runner: { type: "vitest", config: "vite.projection.config.ts" },
    tiers: ["ci", "deep"],
  },

  // spec: Reflex against the executable specification ------------------------
  {
    id: "spec.differential",
    layer: "spec",
    technique: "differential and stateful testing against SpecMachine",
    owner: "test/differential/docs/SEMANTIC_CONTRACT.md",
    files: [
      "test/differential/runtime.differential.test.ts",
      "test/differential/runtime.stateful-differential.test.ts",
      "test/differential/runtime.lifecycle-semantics.differential.test.ts",
      "test/differential/runtime.next-experiments.test.ts",
      "test/differential/runtime.rules-state-space.test.ts",
    ],
    runner: source,
    tiers: ["smoke", "ci", "deep"],
  },
  {
    id: "spec.exhaustive",
    layer: "spec",
    technique: "bounded-exhaustive enumeration of small languages",
    owner: "test/differential/docs/BOUNDED_BASELINE.md",
    files: [
      "test/differential/runtime.bounded-exhaustive.test.ts",
      "test/differential/runtime.recovery-exhaustive.test.ts",
      "test/differential/runtime.adversarial-exhaustive.test.ts",
    ],
    runner: source,
    tiers: ["ci", "deep"],
  },
  {
    id: "spec.watcher",
    layer: "spec",
    technique: "watcher algebra, metamorphic relations, differential",
    owner: "test/differential/watcher/WATCHER_EVIDENCE_BASELINE.md",
    files: ["test/differential/watcher/"],
    runner: source,
    tiers: ["ci", "deep"],
  },
  {
    id: "spec.catalog",
    layer: "spec",
    technique: "active and historical divergence catalogs",
    owner: "test/differential/README.md",
    files: [
      "test/differential/runtime.active-divergences.test.ts",
      "test/differential/runtime.historical-faults.test.ts",
    ],
    runner: source,
    tiers: ["smoke", "ci", "deep"],
  },

  // oracle: Reflex against the frozen baseline -------------------------------
  {
    id: "oracle.differential",
    layer: "oracle",
    technique: "random differential testing against the baseline, shrinking",
    owner: "test/oracle/verdict.ts",
    files: ["test/oracle/oracle.differential.test.ts"],
    runner: source,
    tiers: ["smoke", "ci", "deep"],
    budgets: ORACLE_BUDGETS,
  },
  {
    id: "oracle.invariants",
    layer: "oracle",
    technique: "algorithm-independent invariants on generated programs",
    owner: "test/oracle/program.ts",
    files: ["test/oracle/oracle.invariants.test.ts"],
    runner: source,
    tiers: ["ci", "deep"],
    budgets: {
      deep: { ...ORACLE_BUDGETS.deep, ORACLE_GENERAL_SEEDS: "20000" },
    },
  },
  {
    id: "oracle.corpus",
    layer: "oracle",
    technique: "regression corpus replay (minimized witnesses)",
    owner: "test/oracle/corpus/README.md",
    files: ["test/oracle/oracle.corpus.test.ts"],
    runner: source,
    tiers: ["smoke", "ci", "deep"],
  },

  // qualification: are the oracles strong enough? ---------------------------
  {
    id: "qualification.spec-mutants",
    layer: "qualification",
    technique: "mutation analysis of the spec differential, holdout mutants",
    owner: "test/differential/docs/HOLDOUT_BASELINE.md",
    files: [
      "test/differential/runtime.mutation-qualification.test.ts",
      "test/differential/runtime.holdout-qualification.test.ts",
    ],
    runner: source,
    tiers: ["ci", "deep"],
  },
  {
    id: "qualification.oracle-mutants",
    layer: "qualification",
    technique: "mutation analysis of the baseline oracle",
    owner: "test/oracle/mutants.ts",
    files: ["test/oracle/oracle.qualification.test.ts"],
    runner: source,
    tiers: ["ci", "deep"],
    budgets: { deep: { ORACLE_QUALIFICATION_SEEDS: "10000" } },
  },
  {
    id: "qualification.oracle-coverage",
    layer: "qualification",
    technique: "kernel branch coverage of the generated corpus",
    owner: "test/oracle/branch-coverage.json",
    files: ["test/oracle/oracle.coverage.test.ts"],
    runner: source,
    tiers: ["ci", "deep"],
    budgets: { deep: { ORACLE_COVERAGE_SEEDS: "10000" } },
  },
  {
    id: "qualification.cross-suite-audit",
    layer: "qualification",
    technique:
      "every fault-model mutant against every gating suite: reach, infect, propagate, observe; holdout check",
    owner: "test/oracle/faults.ts",
    runner: { type: "testkit", args: ["audit"] },
    tiers: ["deep"],
  },
  {
    id: "qualification.mutation-matrix",
    layer: "qualification",
    technique: "kill matrix of every oracle mutant against its own source",
    owner: "test/oracle/mutants.ts",
    runner: { type: "testkit", args: ["mutate", "--budget", "5000"] },
    tiers: ["deep"],
  },

  // characterization: what the runtime does where the contract is silent ----
  {
    id: "characterization.open-regions",
    layer: "characterization",
    technique:
      "pinned behavior outside the contract (F1, disposal from a host hook)",
    owner: "docs/characterization/SEMANTIC_CHARACTERIZATION.md",
    files: ["test/characterization/"],
    runner: { type: "vitest", config: "vite.characterization.config.ts" },
    tiers: ["ci", "deep"],
    advisory: true,
  },

  // integration -------------------------------------------------------------
  {
    id: "integration.facade",
    layer: "integration",
    technique: "facade package tests, including the liveness oracle",
    owner: "packages/reflex",
    runner: { type: "vitest", config: "vite.config.ts", cwd: "../reflex" },
    tiers: [],
  },
  {
    id: "integration.build",
    layer: "integration",
    technique: "full package build with projection-erasure and identity checks",
    owner: "rollup.config.ts",
    runner: { type: "pnpm", args: ["build"] },
    tiers: [],
  },
  {
    id: "integration.e2e",
    layer: "integration",
    technique: "packed-consumer end-to-end test",
    owner: "test/mjs/runtime.e2e.mjs",
    files: ["test/mjs/"],
    runner: { type: "node", args: ["test/mjs/runtime.e2e.mjs"] },
    tiers: [],
    requires: "a build (pnpm build)",
  },

  // fuzz: long comparisons across revisions ---------------------------------
  {
    id: "fuzz.diff-head",
    layer: "fuzz",
    technique:
      "working tree against HEAD, production builds, representation policy",
    owner: "test/differential/docs/SEMANTIC_CONTRACT.md",
    runner: {
      type: "testkit",
      args: [
        "diff",
        "--reference",
        "HEAD",
        "--candidate",
        "source",
        "--flavor",
        "production",
        "--policy",
        "representation",
        "--families",
        "default,general,hub,targeted,swarm",
        "--programs",
        "20000",
        "--max-failures",
        "0",
        "--jobs",
        deepJobs,
      ],
    },
    tiers: ["deep"],
  },
  {
    id: "fuzz.diff-baseline",
    layer: "fuzz",
    technique:
      "working tree against the baseline on the families the vitest oracle does not run",
    owner: "test/oracle/verdict.ts",
    runner: {
      type: "testkit",
      args: [
        "diff",
        "--families",
        "targeted,swarm",
        "--programs",
        "20000",
        "--max-failures",
        "0",
        "--jobs",
        deepJobs,
      ],
    },
    tiers: ["deep"],
  },
  {
    id: "fuzz.tracking-graph",
    layer: "fuzz",
    technique: "graph-level differential fuzz of tracking and INV-H",
    owner: "../../scripts/fuzz-tracking-graph.mjs",
    runner: {
      type: "node",
      args: ["../../scripts/fuzz-tracking-graph.mjs", "--baseline", "HEAD"],
    },
    tiers: ["deep"],
  },
  {
    id: "fuzz.tracking-graph-qualify",
    layer: "fuzz",
    technique: "mutation qualification of the tracking-graph fuzzer",
    owner: "../../scripts/fuzz-tracking-graph.mjs",
    runner: {
      type: "node",
      args: [
        "../../scripts/fuzz-tracking-graph.mjs",
        "--baseline",
        "HEAD",
        "--qualify",
      ],
    },
    tiers: ["deep"],
  },

  // self --------------------------------------------------------------------
  {
    id: "self.testkit",
    layer: "self",
    technique: "unit tests of the testkit, catalog inventory",
    owner: "testkit/README.md",
    runner: { type: "node", args: ["--test", "testkit/testkit.selftest.mjs"] },
    tiers: ["smoke", "ci", "deep"],
  },
  {
    id: "self.spec-arbiter",
    layer: "self",
    technique:
      "properties of the spec verdict's comparator: equivalence relation, sensitivity to every field",
    owner: "test/differential/README.md",
    files: ["test/differential/runtime.observation-comparator.test.ts"],
    runner: source,
    tiers: ["smoke", "ci", "deep"],
  },
  {
    id: "self.spec-model",
    layer: "self",
    technique:
      "metamorphic self-check of the executable spec: optimized and direct models agree",
    owner: "test/differential/internal/machine/spec-runtime.ts",
    files: ["test/differential/runtime.spec-self-consistency.test.ts"],
    runner: source,
    tiers: ["ci", "deep"],
  },
  {
    id: "self.oracle-controls",
    layer: "self",
    technique:
      "A/B negative controls: candidates wrong in one observable class must be rejected by every policy",
    owner: "test/oracle/verdict.ts",
    files: ["test/oracle/oracle.controls.test.ts"],
    runner: source,
    tiers: ["smoke", "ci", "deep"],
  },
  {
    id: "self.aa-control",
    layer: "self",
    technique: "A/A control: two instances of one build must agree exactly",
    owner: "testkit/README.md",
    runner: {
      type: "testkit",
      args: [
        "diff",
        "--reference",
        "source",
        "--candidate",
        "source",
        "--policy",
        "exact",
        "--families",
        "default,general,hub,targeted,swarm",
        "--programs",
        "300",
      ],
    },
    tiers: ["ci", "deep"],
  },
];

/**
 * Gates: the checks a change of each kind must pass before commit. The
 * table of docs/GUIDE.md ("Checks by change kind") owns the policy; a gate
 * runs its automatable rows and prints the rest as obligations.
 */
export const GATES = {
  docs: {
    summary: "documentation, comments, types, renames",
    suites: ["static.bundle-identity", "static.rules", "static.format"],
    manual: [],
  },
  refactor: {
    summary: "refactor meant to keep behavior and shape",
    suites: ["static.bundle-identity"],
    manual: [
      "If the bundle differs, the change is not a refactor: run the gate of its kind.",
    ],
  },
  semantic: {
    summary: "semantic change",
    tier: "ci",
    suites: ["integration.facade"],
    manual: [
      "Update the owner document of the changed fact and docs/RULES.md (AGENTS.md, 'Where facts live').",
    ],
  },
  "hot-path": {
    summary: "hot-path performance change",
    tier: "ci",
    suites: ["integration.facade", "fuzz.diff-head"],
    manual: [
      "Shape before/after on the CI Node version: node perf/v8-shape/analyze.mjs --bundle <runtime.mjs>.",
      "Paired CI comparison: .github/workflows/runtime-paired-benchmarks.yml (workflow_dispatch, baseline=<commit>).",
    ],
  },
  build: {
    summary: "build pipeline (rollup/, inlining)",
    suites: [
      "integration.build",
      "integration.e2e",
      "static.artifacts",
      "unit.contracts",
    ],
    manual: [
      "Paired CI comparison: .github/workflows/runtime-paired-benchmarks.yml.",
    ],
  },
  "bench-harness": {
    summary: "benchmark harness (bench/)",
    suites: [],
    manual: [
      "A paired run that reproduces a known result (node bench/compare.mjs).",
      "Update docs/performance/BENCHMARK_PROTOCOL.md.",
    ],
  },
};

export function suite(id) {
  return SUITES.find((item) => item.id === id);
}

/**
 * Suites selected by `selectors` (suite ids, id prefixes such as `oracle.`,
 * or layer names) within `tier`. No selector selects the whole tier; an
 * explicit suite id is selected even when the tier does not include it.
 */
export function select(selectors, tier) {
  if (selectors.length === 0)
    return SUITES.filter((item) => item.tiers.includes(tier));
  const chosen = new Set();
  for (const selector of selectors) {
    const exact = suite(selector);
    const matches = exact
      ? [exact]
      : SUITES.filter(
          (item) =>
            (item.layer === selector || item.id.startsWith(selector)) &&
            item.tiers.includes(tier),
        );
    if (matches.length === 0)
      throw new Error(
        `selector "${selector}" matches no suite in tier ${tier} (pnpm rt list)`,
      );
    for (const item of matches) chosen.add(item);
  }
  return SUITES.filter((item) => chosen.has(item));
}
