# Empty-outgoing producer / suffix-preservation experiment

One runtime change only: in the existing nonzero-version outgoing probe in `reuseIncomingEdgeFromSuffixOrLink`, `producer.firstOut === null` links the new edge directly and preserves the incoming suffix. The version-zero fallback and all other tracking/cleanup policies remain unchanged. No production structural instrumentation or new node fields are added.

## Reproduce

From the repository root, after installing the existing workspace dependencies:

```powershell
$env:BASELINE_REF = '11f0d914dcd3c4234efb26e1aa94ecc88967303a'
node packages/reflex-runtime/perf/suffix-preservation/run.mjs
node packages/reflex-runtime/perf/suffix-preservation/analyze.mjs
```

Default `BASELINE_REF` is HEAD. The before bundle substitutes **only** the baseline `reuseEdge.ts`; all other source/configuration files are shared with after. The runner does not checkout, modify, or rebuild the working source. Both variants use Rollup/SWC and the repository's production Terser policy. `__DEV__` and `__PROFILE__` are false, all three tracking tiers true. The timing bundle is checked for leaked structural counters/profiler calls.

Generated bundles are ignored. JSON samples, CSV, Markdown results, and the runtime patch are retained. `results-first.json` is the first independent full run; `results.json` is the second. Future runs replace the latter; archive it first if needed.

## Matrix / operation definition

D = 0, 1, 16, 31, 32, 33, 64, 256, 1024, 4096.

Every operation writes a distinct tick then reads the computed consumer. The callback always reads tick, whose edge is the stable prefix. Output values are constant across passes, isolating tracking/reconciliation instead of output propagation. Sources, permutations and graph setup are allocated outside measurement.

- `stable`: tick + D fixed dependencies, identical order.
- `alternating`: tick + one alternating source + D fixed suffix dependencies.
- `replacement`: tick + one of two disjoint D-source groups, alternating every pass.
- `reorder`: tick + D fixed sources, using 64 precomputed seeded Fisher-Yates permutations (seed `0x91e10da5`). No producer fanout distractors; this is a fanout-one reorder control.

D=0 is a degenerate control for stable/replacement/reorder; alternating still replaces one edge. In alternating, the old unvisited suffix contains D+1 edges, so the baseline's 32-edge eager-detachment boundary occurs at **D=31**. In replacement the boundary is D=32.

## Structural measurement

A separate AST-transformed build inserts simple `counter++` expressions. It does not enable the existing profiler, count node degrees, use proxies/getters, or add fields to runtime nodes/edges. Counters are reset after initial graph construction, then averaged over 16 transitions.

- `linksTraversed`: reads of `nextIn`, `prevIn`, `nextOut`, `prevOut` inside kernel source, including destructuring and null termination probes. This is an **attempted link/pointer-read metric**, including reposition/unlink bookkeeping; it is not a count of unique graph edges or only successful non-null hops. Head/cursor/from/to loads are excluded.
- `edgeAllocations`: dependency edge object creations.
- `edgeLinks`: new dependency edge attachment events (one logical edge, not individual pointer writes). In these workloads each allocation is linked immediately, so allocations and links coincide; both are retained explicitly.
- `edgeUnlinks`: full edge removal events, counted at the single nextOut-null clear in each unlink path.
- `edgeMoves`: actual incoming-list reorder events on the exercised fallback and tracking shortcuts. No edge allocation is counted as a move.
- `physicalMutations = edgeLinks + edgeUnlinks + edgeMoves`. Do not add allocation again; that double-counts insertion.
- `callbackDependencyReads`: only reads made by the consumer callback, including tick and the alternating dependency where applicable.
- `dependencyDelta`: symmetric difference of consecutive final dependency source sets.
- `stableEdgesEligible`: dependency sources present in both passes, **including tick**.
- `stableEdgesRetained`: eligible sources with identical edge object identity before/after, including tick. Thus subtract one for the fixed suffix's retained count in alternating.

Value assertions, bidirectional-list validation, duplicate-source checks, removed-source checks, and identity/set comparisons occur outside instrumented kernel execution and outside timing. Structural and timing builds are never mixed in a timing sample. Current instrumentation covers the edge allocation/move/unlink paths exercised by these workloads; it is not an all-purpose profiler for arbitrary future kernel changes.

## Timing measurement

Each workload/D cell runs in a fresh child process. Before and after are separate production modules in that process, with separate graphs. Each graph warms for at least 100 ms. Calibration chooses a shared power-of-two batch size targeting at least 20 ms on before (cap 1,048,576 operations). Fifteen paired samples alternate AB/BA order. Explicit GC runs before each sample, outside timing; allocation-triggered GC within the batch remains included. Workloads include write + read + callback and a common result accumulator; source/permutation setup is excluded.

Raw batch-normalized ns/op samples, mean, median, p75, p95, p99, sample variance, approximate t-based 95% RME, ops/sec, batch iterations and aggregate measured wall time are saved. **p99 is a percentile of batch-average ns/op, not individual-operation p99 latency.** Fifteen batch samples cannot characterize rare per-operation tail events. RME assumes independent samples and is descriptive on this unpinned Windows laptop; no frequency control or universal speedup claim is made. Two independent full runs provide a reproducibility check, not a substitute for production workload validation.

## Decision

See [measured results](results/summary.md). The target mechanism is confirmed: alternating workloads retain stable edge identities and eliminate their allocations/unlinks. However, preserved stable edges still move past the obsolete alternating edge, so physical mutations are **D+2, not 2**. Large complete replacement regresses in both full runs while physical mutations are unchanged and link reads increase. This patch is retained as the requested isolated experiment; it should not be described or adopted as an unconditional runtime improvement. No second optimization was added to repair that tradeoff.

The full pre-experiment state/proof/cost report is [semantic optimization baseline](../../docs/semantic-optimization-baseline.md). Measured outcomes refine its hypotheses; they do not rewrite the pre-experiment conclusions.
