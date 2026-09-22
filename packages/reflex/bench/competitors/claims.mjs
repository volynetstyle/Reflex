import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

export const CLAIMS = [
  {
    id: 1,
    name: "Correctness",
    kind: "semantic",
    evidence: [
      "packages/reflex-runtime/test/differential/runtime.differential.test.ts",
      "packages/reflex-runtime/test/differential/runtime.adversarial-exhaustive.test.ts",
      "packages/reflex/bench/competitors/contracts.mjs",
    ],
    falsifier:
      "Any generated trace or contract produces a result different from the independent model.",
  },
  {
    id: 2,
    name: "Semantic completeness",
    kind: "semantic",
    evidence: [
      "packages/reflex-runtime/src/kernel/stages/second/README.md",
      "packages/reflex-runtime/test/runtime/contracts/runtime.state-machine.test.ts",
    ],
    falsifier:
      "An Unknown/Changed, root/branch, retry, dynamic-dependency, or reentrancy transition has no specified outcome.",
  },
  {
    id: 3,
    name: "Explicit invariants",
    kind: "static-contract",
    evidence: ["packages/reflex-runtime/src/kernel/stages/second/README.md"],
    falsifier:
      "The implementation can clear Unknown without a stable frontier or cross user code without re-observing root evidence.",
  },
  {
    id: 4,
    name: "Performance topology coverage",
    kind: "benchmark",
    evidence: ["packages/reflex/bench/competitors/scenarios.mjs"],
    falsifier:
      "Reflex has a repeatable throughput regression on a linear, wide, diamond, DAG, selective, dirty, dynamic, or product workload.",
  },
  {
    id: 5,
    name: "Latency stability",
    kind: "benchmark",
    evidence: ["packages/reflex/bench/competitors/worker.mjs"],
    falsifier:
      "A sufficiently sampled p99/p999 or max latency regresses even when mean throughput does not.",
  },
  {
    id: 6,
    name: "Allocation discipline",
    kind: "controlled-memory-benchmark",
    evidence: ["packages/reflex-runtime/perf/callback-memory/run.mjs"],
    falsifier:
      "A controlled allocation experiment shows bytes/op or retained ownership growing disproportionately with graph work; cross-runtime heap deltas are diagnostic only.",
  },
  {
    id: 7,
    name: "Scaling behavior",
    kind: "benchmark",
    evidence: ["packages/reflex/bench/competitors/scenarios.mjs"],
    falsifier:
      "The CSV curves become super-linear where the declared topology implies linear work.",
  },
  {
    id: 8,
    name: "Dynamic-topology robustness",
    kind: "semantic+benchmark",
    evidence: [
      "packages/reflex/bench/competitors/scenarios.mjs",
      "packages/reflex-runtime/test/runtime/topology/runtime.property-topology.test.ts",
    ],
    falsifier:
      "Oscillation/reordering leaves a stale edge, wrong value, or unbounded tracking amplification.",
  },
  {
    id: 9,
    name: "Reentrancy robustness",
    kind: "semantic",
    evidence: [
      "packages/reflex/bench/competitors/contracts.mjs",
      "packages/reflex-runtime/test/runtime/contracts/runtime.state-machine.test.ts",
    ],
    falsifier:
      "A bounded self-invalidating observer misses a required reread or produces a nondeterministic trace.",
  },
  {
    id: 10,
    name: "Failure semantics",
    kind: "semantic",
    evidence: [
      "packages/reflex/bench/competitors/contracts.mjs",
      "packages/reflex-runtime/test/differential/runtime.recovery-exhaustive.test.ts",
    ],
    falsifier:
      "Throw/retry, partial frontier, nested failure, or post-failure disposal diverges from the model.",
  },
  {
    id: 11,
    name: "Lifecycle correctness",
    kind: "semantic",
    evidence: [
      "packages/reflex-runtime/test/differential/runtime.lifecycle-semantics.differential.test.ts",
      "packages/reflex/bench/competitors/contracts.mjs",
    ],
    falsifier:
      "A disposed observer reruns or a lifecycle transition leaves a live edge/evidence bit.",
  },
  {
    id: 12,
    name: "Determinism",
    kind: "semantic",
    evidence: [
      "packages/reflex/bench/competitors/contracts.mjs",
      "packages/reflex/tests/reflex.scheduling.test.ts",
    ],
    falsifier:
      "Repeated equal causal traces produce different values or observer order.",
  },
  {
    id: 13,
    name: "Minimal mechanism",
    kind: "static-audit",
    evidence: [
      "packages/reflex-runtime/src/kernel/stages/second/pull_dependency.ts",
      "packages/reflex-runtime/src/kernel/stages/second/pull_frontier.ts",
      "packages/reflex-runtime/src/kernel/stages/second/README.md",
    ],
    falsifier:
      "A guarantee depends on hidden global side tables or scenario-specific node states not described by the kernel contract.",
  },
  {
    id: 14,
    name: "Orthogonality",
    kind: "static+semantic",
    evidence: [
      "packages/reflex-runtime/src/kernel/stages/second/README.md",
      "packages/reflex-runtime/test/projection/stages.projection.test.ts",
    ],
    falsifier:
      "Changing consumer policy requires changing dependency proof/traversal semantics.",
  },
  {
    id: 15,
    name: "Composability",
    kind: "semantic+benchmark",
    evidence: [
      "packages/reflex-runtime/test/perf/push-pull-components.bench.ts",
      "packages/reflex/tests/reflex.policy.test.ts",
    ],
    falsifier:
      "Computed, watcher, pull-frontier, or pull-all requires a semantic fork in the dependency primitive.",
  },
  {
    id: 16,
    name: "Fast common path",
    kind: "benchmark",
    evidence: ["packages/reflex/bench/competitors/scenarios.mjs"],
    falsifier:
      "changed-leaf, same-write, equal-result, changed-result, cached chain reads, or deep-unknown shows a repeatable weak path.",
  },
  {
    id: 17,
    name: "Bounded rare path",
    kind: "benchmark+semantic",
    evidence: [
      "packages/reflex/bench/competitors/scenarios.mjs",
      "packages/reflex-runtime/test/runtime/topology/runtime.walkers.test.ts",
    ],
    falsifier:
      "The 16,384-deep case overflows, hangs, or exceeds the expected linear curve.",
  },
  {
    id: 18,
    name: "Proof locality",
    kind: "diagnostic",
    evidence: [
      "packages/reflex-runtime/src/kernel/stages/second/README.md",
      "packages/reflex-runtime/test/runtime/debug/runtime.debug-trace.test.ts",
    ],
    falsifier:
      "A violated branch/root/continuation invariant cannot be attributed to a local transition.",
  },
  {
    id: 19,
    name: "Mutation resistance",
    kind: "semantic",
    evidence: [
      "packages/reflex-runtime/test/differential/runtime.mutation-qualification.test.ts",
      "packages/reflex-runtime/test/differential/mutant/mutation-corpus.ts",
    ],
    falsifier: "A qualified semantic mutant survives the differential suite.",
  },
  {
    id: 20,
    name: "Independent oracle",
    kind: "semantic",
    evidence: [
      "packages/reflex-runtime/test/differential/internal/machine/SpecMachine.ts",
      "packages/reflex-runtime/test/differential/README.md",
    ],
    falsifier:
      "The oracle shares production traversal/state machinery or cannot detect historical faults.",
  },
  {
    id: 21,
    name: "Cross-runtime semantic comparison",
    kind: "semantic",
    evidence: ["packages/reflex/bench/competitors/contracts.mjs"],
    falsifier:
      "A capability is inferred from speed rather than an observable contract trace.",
  },
  {
    id: 22,
    name: "Cross-runtime fair performance comparison",
    kind: "benchmark",
    evidence: [
      "packages/reflex/bench/competitors/adapters.mjs",
      "packages/reflex/bench/competitors/run.mjs",
      "packages/reflex/bench/competitors/worker.mjs",
    ],
    falsifier:
      "Frameworks receive different observable tasks, work is hidden, versions float, or run order/process state is biased.",
  },
  {
    id: 23,
    name: "No benchmark-specific architecture",
    kind: "benchmark",
    evidence: ["packages/reflex/bench/competitors/scenarios.mjs"],
    falsifier:
      "Microbenchmark wins disappear in the task-board product workload.",
  },
  {
    id: 24,
    name: "Explainability",
    kind: "documentation",
    evidence: ["packages/reflex-runtime/src/kernel/stages/second/README.md"],
    falsifier:
      "Correctness/performance requires reasoning about an undocumented global iterator state.",
  },
  {
    id: 25,
    name: "Falsifiability",
    kind: "meta",
    evidence: ["packages/reflex/bench/competitors/claims.mjs"],
    falsifier:
      "Any strong claim in this catalog lacks an explicit failing observation.",
  },
  {
    id: 26,
    name: "Semantic-to-performance causality",
    kind: "instrumentation",
    evidence: [
      "packages/reflex-runtime/test/perf/cost-attribution/timing.sweep.ts",
      "packages/reflex-runtime/perf/suffix-preservation/analyze.mjs",
    ],
    falsifier:
      "The claimed invariant does not reduce measured loads, branches, scans, mutations, or allocations.",
  },
  {
    id: 27,
    name: "Extensibility without hot-path tax",
    kind: "static+benchmark",
    evidence: [
      "packages/reflex-runtime/test/perf/static-transition-plan.bench.ts",
      "packages/reflex-runtime/test/perf/runtime-taxonomy.bench.ts",
    ],
    falsifier:
      "An unused policy/scheduler/resource adds node fields, branches, or measurable base-path cost.",
  },
  {
    id: 28,
    name: "Mechanical sympathy",
    kind: "instrumentation",
    evidence: [
      "packages/reflex-runtime/perf/perf-tree/run.mjs",
      "packages/reflex/bench/competitors/worker.mjs",
    ],
    falsifier:
      "Wall-time claims cannot be connected to loads, work counters, allocations, GC, stack behavior, or JIT mode.",
  },
  {
    id: 29,
    name: "Stable public semantics over replaceable internals",
    kind: "semantic",
    evidence: [
      "packages/reflex-runtime/test/runtime/contracts/runtime.state-machine.test.ts",
      "packages/reflex/tests/package.exports.test.ts",
    ],
    falsifier:
      "Replacing the walker changes a public contract trace or public API behavior.",
  },
  {
    id: 30,
    name: "Explicit non-guarantees",
    kind: "documentation",
    evidence: ["packages/reflex/bench/competitors/README.md"],
    falsifier:
      "A report implies guarantees for concurrency, async interleaving, corrupted graphs, or scheduler order outside the stated model.",
  },
];

function markdown() {
  const lines = [
    "# Claim evidence map",
    "",
    "This catalog does not turn measurements into a proof for every machine. It makes every claim independently falsifiable and points to the evidence that can reject it.",
    "",
    "| # | Claim | Evidence kind | Falsifying observation |",
    "|---:|---|---|---|",
  ];
  for (const claim of CLAIMS) {
    lines.push(
      `| ${claim.id} | ${claim.name} | ${claim.kind} | ${claim.falsifier} |`,
    );
  }
  lines.push("", "## Evidence files", "");
  for (const claim of CLAIMS) {
    lines.push(
      `- ${claim.id}. ${claim.evidence.map((path) => `\`${path}\``).join(", ")}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const missing = [];
  const ids = new Set();
  for (const claim of CLAIMS) {
    if (ids.has(claim.id)) missing.push(`duplicate claim id ${claim.id}`);
    ids.add(claim.id);
    for (const path of claim.evidence) {
      try {
        await access(resolve(repositoryRoot, path));
      } catch {
        missing.push(`${claim.id}: ${path}`);
      }
    }
  }
  for (let id = 1; id <= 30; id++) {
    if (!ids.has(id)) missing.push(`missing claim id ${id}`);
  }
  process.stdout.write(markdown());
  if (missing.length > 0) {
    process.stderr.write(
      `Missing/invalid claim evidence:\n${missing.join("\n")}\n`,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
