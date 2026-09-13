# Bounded-lookahead block rotation experiment

Compare **preserve + move-candidate** against **preserve + rotate-unvisited-block**, replacing only `moveTrackedIncomingEdgeAfterCursorUnchecked` in isolated builds. The candidate is already found by the existing one-/two-hop lookahead. No other move helper, search algorithm, context handling or detach policy changes. The preserve patch is shared by both variants. This is not a comparison against the original eager-threshold baseline.

The rotation implementation is [rotation-body.ts.txt](rotation-body.ts.txt). It is a build/test overlay; production `src` is unchanged by this experiment. The [seven invariants](INVARIANTS.md) were recorded before implementation.

## Reproduce

From repository root with existing dependencies installed:

```powershell
node packages/reflex-runtime/perf/block-rotation/run.mjs
node packages/reflex-runtime/perf/block-rotation/oracle.mjs
node packages/reflex-runtime/perf/block-rotation/analyze.mjs
pnpm --filter @volynets/reflex-runtime exec vitest run --config perf/block-rotation/vitest.config.ts
```

run.mjs builds two production modules and two separately instrumented structural modules, runs invariant probes, then starts a fresh child process for each workload/D cell. It does not modify/check out runtime source. It records source/overlay/bundle SHA-256 hashes. Both timing modules use the existing production Terser policy, DEV/PROFILE=false and all three tracking tiers enabled. They export the bounded helper equally for direct invariant probes; no experimental counters or observer hooks remain in timing modules. Generated modules are ignored; JSON, CSV, reports and overlay source are retained.

`results-first.json` and `results.json` hold two independent full runs; future runs overwrite the latter. Archive before rerunning. [summary.md](results/summary.md) shows the complete measured matrix, [oracle.md](results/oracle.md) the separate modeled oracle.

## Matrix and traces

D = 0, 1, 16, 31, 32, 33, 64, 256, 1024, 4096. Ten workloads, 100 cells per full run:

- stable, alternating dependency + D-source suffix, complete D-source replacement, seeded random reorder;
- local swap of the first two dependencies;
- successive cyclic shifts left by one, left by two, right by one;
- front insertion/removal of one extra dependency;
- cyclic-left-one with an injected throw after reading tick and the first dependency, followed by immediate retry.

Every callback reads a stable tick first, so the bounded match has a non-null cursor. Ordinary source values are 1. Operations write tick and read the consumer; expected result is number of non-tick dependencies. Equal-output controls isolate tracking/reconciliation. Insertion changes the count, but the consumer has no outgoing dependents. Cyclic callbacks index a preallocated source ring, avoiding O(D squared) precomputed traces or timed allocation. Random reorder uses 64 precomputed seeded Fisher-Yates permutations (seed 0x91e10da5). Graph/source/permutation creation is outside measurement. D=0/1 includes degenerate controls; injected failure is enabled only at D>=2.

Structural measurements cover the first 16 transitions after initial graph creation, deterministically repeated in both full runs. Timing runs many transitions (all 64 random orders, and complete cyclic periods as batch lengths permit). Thus structural random-order summaries describe this explicit sample, not an exact census of every timed permutation. Structural pass count is stored in JSON.

## Cost vector: no blended score

Each structural counter is a simple increment inserted by a TypeScript AST transform. No profiler degree traversal, proxy, getter, event collector or additional node field exists inside the kernel.

- **R**: callback dependency reads, including tick and repeated reads in failed attempts.
- **S**: source/target and graph-pointer reads in named reconciliation/search functions (cold initial/cursor misses, prefix lookup, default fallback and suffix search). Primary sequential/cursor-hit resolver work and mutation-helper endpoint reads are excluded. Version/flag tests are excluded. This is an operational search/probe-read count, not unique edges or candidate rank. `build.mjs` lists the exact functions/fields; stable traces measure S=0.
- **A**: edge object allocations.
- **L/U**: logical edge attachments/removals. A linked allocation is not counted twice in any mutation ratio.
- **M**: individual incoming-edge moves, on all exercised tracking/fallback paths.
- **B**: bounded unvisited-block rotations, independently counted.
- **W**: raw graph-pointer writes = incomingPointerWrites + outgoingPointerWrites + endpointPointerWrites. Incoming includes firstIn/lastIn/tailIn/prevIn/nextIn; outgoing includes firstOut/lastOut/prevOut/nextOut; endpoints are from/to initialization. Edge allocation writes its six pointer fields and is included. State/version/payload writes, execution registers and arrays are excluded. W is not a machine instruction count or total process memory-store count.
- **Delta**: symmetric difference between consecutive final dependency source sets, excluding no-op membership changes. Tick is present on both sides and contributes zero.

Report `SearchAmp = S/(1+Delta)` and `MutationAmp = (L+U+M)/(1+Delta)` separately. A, B and W stay separate. In particular, a lower MutationAmp after substituting rotations for moves is incomplete without B/W. No A+B+reads weighted total is used. Delta_set=0 for reorder; it is not an order-edit distance.

## Candidate and skipped-block diagnostics

A separate offline list replay uses the known old/new traces. It computes candidateSearchDistance (incoming-list rank from expected edge, including candidate), skippedBlockLength, remainingSuffixLength (edges after candidate), and per-rotation nextReadWasSkippedBlockHead / readsUntilSkippedBlockReuse. Candidate rank is not the actual number of probes: firstOut/lastIn shortcuts may locate a distant edge directly. S measures executed search reads.

The replay handles only the exercised fanout-one traces with unique source membership (duplicate reads are supported), not arbitrary runtime hooks or cross-consumer topology. On every measured structural transition its A/L/U/M/B/W counts are asserted equal to actual instrumented counts, and final order/edge identity and two-list integrity are independently checked. It never runs in the timed region or adds list traversal inside the runtime. Search S is measured in source, not guessed by replay.

Diagnostics for all candidate reorder events and for rotations are stored separately. Reuse distance counts callback reads until **any** edge in the skipped block is read again; the next-head metric specifically tests its head. No reuse by successful pass end is a distinct count, not a JSON Infinity. No reuse before throw is **censored**, not proof of permanent staleness; retry starts a new attempt. Diagnostic distributions include count/min/max/mean/histogram. Snapshot/replay work is outside measured counters and outside timing.

## Timing and limitations

Separate noninstrumented modules/graphs, at least 70 ms warmup per graph, shared power-of-two batch size calibrated to >=15 ms on move (cap 1,048,576), 15 paired AB/BA samples. Explicit GC before each sample, outside timing; allocation-triggered GC inside the batch remains included. A common result accumulator prevents unused-result benchmarking. Mean/median/p75/p95/p99, variance, approximate 95% RME, ops/sec, aggregate wall time and raw samples are saved.

Percentiles are of batch-average ns/op, **not individual-operation tail latency**. Windows laptop frequency/scheduling is uncontrolled; control workloads show timing variation despite unchanged structural vectors. Repeated large mechanism-consistent effects are stronger evidence than small isolated percentages. Two runs do not establish production-wide performance or precise hardware cost weights.

## Failure/retry and topology validation

Per variant, verify.mjs exercises 36 direct splice cases with another consumer sharing producers (outgoing lists must remain identical), 1,442 throw/retry cases, and five lifecycle scenarios. Permutation tests cover all 120 orders of five dependencies, throwing after each of six reads including tick, then retrying either the same trace or a reordered/shrinking trace. Two additional cases throw after allocating a new dependency and rotating an old block, then retry with full or shrinking traces. They verify edge identity, two-list consistency, exact observed prefix, cleared Computing, Changed-for-retry, restored tracking context, and successful cleanup.

Lifecycle cases cover nested computed reads/untracked execution; writes to skipped versus current-prefix dependencies after a reorder; self-disposal both with and without a subsequent read; watcher body failure, recovery and untracked cleanup. These probes are evidence for the scoped change, not exhaustive equivalence under arbitrary internal mutation or custom strategies.

The existing runtime suite is also run with the rotation overlay. One existing two-hop test asserts the old physical order of the **unvisited** suffix. The experimental config changes that assertion to rotation's order without changing its slow-path prohibition, version, cursor, outgoing or integrity assertions. Original test/source files are not modified. All other tests run unchanged.

## Offline oracle

The [oracle model](results/oracle.json) computes exact **separate** minima for A and W within a bounded action set, with independent brute-force cross-checks. It compares preserve/move, preserve/rotate, immediate-eager/move and immediate-eager/rotate. Eager here is a counterfactual immediate policy, not the original threshold-32 implementation. Candidate search, flags/branches, GC and timing are excluded; no claim of an ideal wall-time policy is made. A/W regrets are relative to their respective optima, not a fabricated weighted Cost score. See oracle.md for explicit limitations and adversarial traces.

## Decision boundary

Rotation targets long retained runs after a small skipped block. Local swaps may require an additional move and more searches/writes. Complete replacement has no old candidate and cannot benefit from this bounded helper change; its existing preserve regression is not repaired. No adaptive selector/detach or cursor/version patch is included. Retain the experiment and measured tradeoffs; a production policy decision needs workload evidence beyond these controls.
