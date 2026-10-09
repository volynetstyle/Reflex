# Async frontier representations

## Production walker comparison

`walker-bench.mjs` compares the actual `src/async/frontier.ts` implementation
against a locally captured source baseline. It transpiles both versions with
the same SWC options, alternates process order over three rounds, and reports
the median of 21 samples per scenario. Run from `packages/reflex-async`:

```powershell
# Capture before modifying frontier.ts; an existing baseline is never overwritten.
node lab/async-frontier/walker-bench.mjs --capture-baseline
# Compare the current implementation with that baseline.
node lab/async-frontier/walker-bench.mjs
# Keep separate checkpoints, e.g. the epoch walker before removing WeakMap:
$env:REFLEX_WALKER_BASELINE = 'weakmap'
node lab/async-frontier/walker-bench.mjs
```

The baseline, compiled modules, source hashes, environment information and raw
timings are kept in `.cache/frontier-walker/`. The workloads cover direct proofs,
shared diamonds, deep and wide graphs, unsuccessful owner searches, overlapping
reentrant walks, and capture followed by materialization. Traversal fixtures are
constructed before timing; these are warmed frontier microbenchmarks, not
end-to-end async lifecycle measurements.

Sources allocate a symbol-keyed scratch cell at construction. Proof nodes carry
the same cell layout, so traversal reads visitation marks directly without a
WeakMap, per-leaf hash lookup, or lazily attached properties. Even frozen source
handles can own a mutable scratch cell. Internal synthetic dependency handles
must initialize `[FRONTIER_STATE]` with `createFreshnessState()`.

The walker uses unique epochs so ordinary walks do not journal or clear visited
marks. Nested walks journal and restore marks to preserve suspended traversals,
including when a callback throws or an owner search exits early. Scratch stacks
release references and retain bounded capacity after the outer walk finishes.
DFS descends directly into the first child, pushing only pending siblings.
Publication vectors remain independently owned by their callers; the change
does not retain flattened transitive dependency vectors on every DAG node.

Each source also receives a numeric ID. New proof snapshots fold the minimum
and maximum reachable IDs from their immediate children's summaries once. Owner
checks outside a proof's range return in constant time, and searches prune
out-of-range subgraphs. An ID inside the range still requires an exact identity
search: gaps in the range are allowed. The worst case stays O(V + E), while
constructing a chain whose successive owners lie outside prior ranges avoids
repeated traversal of the entire prefix. Bounds cost two numbers per scratch
cell and O(k) work for a snapshot with k immediate entries; the benchmark includes
small direct capture and unsuccessful searches inside a range to expose that
tradeoff. Saturating IDs remain safe because bounds never prove membership.

Small direct capture stays in a packed vector through 16 unique dependencies.
Wider captures promote to a Set and use one insertion plus a size check to
deduplicate, avoiding separate `has` and `add` lookups.

Comparison with the preceding epoch + WeakMap implementation on Node 25.2.0,
Windows, Intel Core i5-1235U (three isolated process pairs, 21 samples):

| Workload                                 | Before, ns/op | After, ns/op |              Speedup |
| ---------------------------------------- | ------------: | -----------: | -------------------: |
| Shared diamond materialization           |         2,158 |        1,753 |                1.23x |
| Deep materialization, 2048 nodes         |        37,113 |       32,030 |                1.16x |
| Wide materialization, 4096 entries       |        56,468 |       38,736 |                1.46x |
| Absent owner outside ID range            |        37,632 |           26 | O(1) range rejection |
| Absent owner inside ID range             |        37,793 |       32,461 |                1.16x |
| Capture owner-checked chain, 256 sources |       644,939 |       37,502 |               17.20x |
| Nested overlapping callbacks             |         5,186 |        4,137 |                1.25x |
| Capture + materialize, 16 leaves         |           591 |          358 |                1.65x |
| Capture + materialize, 64 leaves         |         2,027 |        2,238 |                0.91x |

Direct-only materialization of 256 leaves was essentially unchanged (1,152 vs
1,169 ns/op). The 64-leaf capture case is about 10% slower, reflecting the cost
of building summaries. The large owner-search gain applies when the range
rejects the owner; it is not a general constant-time membership guarantee.
Raw samples and source hashes are in `.cache/frontier-walker/report-weakmap.json`.

## Representation experiments

`bench.mjs` compares isolated representations of async freshness frontiers:

| Variant     | Capture                                 | Validation deduplication                                                  |
| ----------- | --------------------------------------- | ------------------------------------------------------------------------- |
| `set`       | Current Set union and snapshot copy     | Set membership during capture                                             |
| `flat`      | Flat array with linear duplicate checks | Duplicates removed during capture                                         |
| `dag-set`   | Shared frontier segments                | Local Set during publication                                              |
| `dag-epoch` | Shared frontier segments                | Mutable epoch on dependencies; a Set still tracks visited shared segments |
| `dag-flat`  | Ordered shared proof graph              | Pure materialization; one cached flat distinct vector per attempt         |

Run from `packages/reflex-async`:

```powershell
node --expose-gc lab/async-frontier/bench.mjs
```

The benchmark reports capture and publication time separately for chains at
depths 1/4/16/64/256, diamonds at depths 1/4/16, fan-in 2/4/8/16/64, repeated
cached-child reads, alternating branches, a 90% frontier drop and blocked
retries. It measures capture of an attempt over a cached depth-64 chain, cold
publication with one and four validations, and warm retry loops over one cached
frontier. The report records tracked frontier-container allocations per
operation, distinct validation calls and retained heap for cached chains and
diamonds.

Retained heap is estimated from the post-GC live-heap delta of 24 independently
built graphs per sample, after a warmup and two explicit GCs. The report gives
bytes per retained frontier. It remains an approximation of retained memory, not
a count of all bytes allocated while constructing and collecting a frontier.
Run the process without other benchmark jobs. Set `REFLEX_FRONTIER_ROUNDS` and
`REFLEX_FRONTIER_SAMPLES` to change sampling.

Each variant/round runs in a fresh Node process. The process order rotates between
rounds. Allocation counts cover explicit representation arrays, sets and snapshot
nodes; they exclude closures and engine-internal allocations.

Each representation is checked against the same dependency union before timing.
The validation check includes a nested validation of an overlapping frontier.
The epoch variant uses one mutable marker per dependency. A nested validation can
overwrite the outer epoch and make the outer walk validate a shared dependency
again; the report records these calls so the tradeoff remains visible. The nested
case puts a shared leaf after the reentrant dependency to expose epoch clobbering.

This is a data-structure microbenchmark. It excludes Reflex's scheduler, watcher
and async-source lifecycle. Production correctness and mutation qualification
remain separate checks from these timing comparisons.

See [`results.md`](./results.md) for the recorded comparison and its limits.

`consumption-bench.mjs` exercises the actual production implementation and runtime:

```powershell
pnpm bench:async:consumption
```

It covers sync derived chains, async sync-result and Promise chains, a cached
depth-64 sync bridge, diamonds, dynamic branches, blocked candidate retries,
supersession and 0/1/4/16 freshness pulls on a pending attempt before settlement.
Each explicit pull calls `read()` and verifies an `AsyncBlocker`; the promise is
settled afterward and the fresh result is checked. `refresh()` and `resolve()`
also perform their ordinary lifecycle checkpoints, included in every case.

Separate probes use the actual frontier and Attempt code to measure repeated
pulls, 1/2/8/64 independent attempts sharing one proof, and owner detection by
capture traversal, deferred materialization, or membership in an already-flat
vector. The owner probe checks error timing as well as hidden-owner detection.
These alternatives are experiments and do not change production cycle policy.

Lifecycle timings use the semantics lab's production bundle, with identical
publication-observer instrumentation in both compared builds and no active
hooks. Primitive probes use an uninstrumented bundle. Rounds run in isolated
processes, alternate build order and share calibrated iteration counts. Set
`REFLEX_CONSUMPTION_ROUNDS` to change rounds. Run without competing benchmark or
test processes.

For a before/after comparison, capture the current production bundle with
`node lab/async-frontier/consumption-bench.mjs --capture-baseline` before editing.
An existing baseline is preserved. Without a captured baseline, the script
reports absolute current timings. Raw reports and bundles live in
`.cache/async-frontier/`; recorded findings are in
[`consumption-results.md`](./consumption-results.md).
