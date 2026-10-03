# Async semantics comparison

This experiment tests async composition above the synchronous runtime before
considering a kernel change. It implements the constraint in
[ARCHITECTURE.md](../../../../ARCHITECTURE.md). Nothing in this directory is
exported by the package or imported by production entry points.

The A/B1/B2/B/B3/C comparison now uses [baseline.ts](baseline.ts), the pre-refactor
async implementation with its factory import relocated. Production semantics are
tested separately against the same corpus and explorers:

```powershell
node packages/reflex-async/lab/async-semantics/run.mjs --production-only
node packages/reflex-async/lab/async-semantics/qualify-b3-mutations.mjs --production
```

The `P` bundle uses production sources and the internal evaluated-computed adapter;
it enables all B3-specific checks. Only observation hooks and the experimental
tagged-read method are injected. Reports go to `.cache/async-semantics/production-*.json`.
See [production architecture](../../docs/async-architecture.md) and
[production-mutations.mjs](production-mutations.mjs).
The verified production snapshots are [production-correctness-results.json](production-correctness-results.json)
and [production-mutation-results.json](production-mutation-results.json): 84/84
corpus cases, 6,897 bounded replays across nine capture/schedule runs, and nine
killed mutants. The explorer is complete only within its recorded depth and state bounds.

## Variants

| Variant | Consumer evaluation                                       | Frontier handling                                                                     |
| ------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| A       | Ordinary computed; a blocker throws through evaluation    | No async metadata on cached consumers                                                 |
| B1      | Tagged evaluation; blockers throw after the consumer read | No transitive frontier                                                                |
| B2      | Tagged evaluation                                         | Capture and validate only when an async attempt reads a cached consumer               |
| B       | Tagged evaluation                                         | Validate the captured frontier on each accessor read                                  |
| B3      | Tagged evaluation                                         | Collect the frontier on async capture; validate its deduplicated union at publication |
| C       | Ordinary computed                                         | Deferred-read callback on every `readProducer` invocation                             |

Every variant shares the same `AsyncSource` lifecycle: attempt identity, commit
authority, dependencies, wake behavior and async operation. A/B1/B2/B/B3 change
only the isolated consumer experiment. C adds kernel read dispatch.

[build.mjs](build.mjs) creates separate bundles from the same source tree.
For B1/B2/B/B3 it instruments `AsyncSource.readFreshCommit()` to report a
dependency handle to [frontier.ts](frontier.ts). B1 captures no frontier. B2
validates it only during async capture. B preserves the first experiment's
per-access validation. B3 copies the deduplicated source set into the active
attempt and checks each member at publication. The collected frontier is a
snapshot of the proof obligations observed by that attempt; recomputing a
cached consumer cannot replace them through a mutable frontier reference.
When a cached child is read while its parent recomputes, B3 also forwards the
child's frontier into the parent's active collector, even outside async capture.
This keeps proof obligations intact when previously warmed leaves are assembled
into a new cached branch.
There is no change to runtime node layout or the synchronous producer/consumer
protocol.

For C it adds a dedicated deferred producer to `AsyncCore`, delegates public
fresh reads through that node, and inserts an optional callback check into
the generated `readProducer`. The ordinary `commitNode`, `stateNode` and
`refreshNode` remain synchronous. These transformations only affect bundles
in `.cache/async-semantics`; the source files are never edited. Exact-match
guards reject source drift, and the runner checks source hashes before and
after the experiment.

C is a deliberately narrow dispatch experiment. It is not a complete
suspension-aware kernel, and its failures do not prove that every possible
kernel design would fail. They test whether moving source read dispatch alone
solves the observed composition problems.

## Consumer model

[evaluation.ts](evaluation.ts) captures a blocker as an execution result inside
an ordinary computed. Its public accessor unwraps the result after the
consumer read has established its dependency edge. Consequently a blocked
evaluation still connects its consumer to the next computed or effect.

Each computation captures its async dependency frontier. Before returning a
cached result, B validates that frontier and replays its dependencies into any
enclosing async attempt. Nested consumer evaluations merge their frontiers.
Recomputation replaces the frontier, including when a dynamic branch removes
an old dependency. Validation runs untracked, so normal graph edges come from
the computation rather than the validation checkpoint.

Pending remains an evaluation status. Successful source commits remain in
ordinary producer storage throughout updates, failures and blocked reads.
This prototype does not merge sync/async public APIs or change the visibility
of `AsyncBlocker`.

## Run

From the repository root:

```powershell
pnpm.cmd --filter @volynets/reflex-async test:async:semantics
pnpm.cmd --filter @volynets/reflex-async test:async:semantics:mutations
pnpm.cmd --filter @volynets/reflex-async bench:async:semantics
pnpm.cmd --filter @volynets/reflex-async typecheck:async:semantics
```

On platforms without PowerShell's script execution restriction, `pnpm` works
in place of `pnpm.cmd`. No package build or captured baseline is required.

The correctness runner tests 28 scenarios under `flush`, `sab` and `eager`
scheduling, for 84 checks per variant. The shared corpus covers both async
diamond completion orders, branch removal, committed `undefined`, rejection
with an existing commit, supersession, disposal, wake notifications,
validation-time blocking, and warmed sync consumers hiding async dependencies.
Eight additional B3 stress cases exercise cached paths of depth 16/64/256,
96 consumers sharing one root, repeated reads, nested diamonds with two roots,
90% branch pruning, attempt supersession at publication, invalidation during
validation, and validation-time blocking/failure. One snapshot regression
case mutates a cached frontier in place after collection while its former root
is pending. These stress assertions are B3-only; the matching rows in other
variants are control no-ops. The DOM case uses a real jsdom element driven by a Reflex effect;
it checks the pending text and terminal value without manually rereading the
computed. It does not exercise the full `reflex-dom` component renderer.

Settled reads may encounter a transient validation blocker. The corpus retries
those reads for a bounded 16 checkpoints and still fails a source that cannot
resume. DOM effects must resume through dependency notifications.

## Bounded frontier exploration

`async-spec-machine.ts` adds an independent plain-record oracle and a bounded
state explorer for the B3 cached-frontier path. The machine has two async roots,
three cached computed branches (root A, root B, and a nested shared A/B diamond
with repeated reads), and one async target. It enumerates branch changes, root
refresh/settle/failure, target settlement in oldest/newest order, supersession,
disposal, and validation events that invalidate, fail, or dispose a sibling
dependency, or supersede the target between capture and publication. The
pending invalidation also exercises the publication blocker and later resume
path.

The collector freezes each flight's root frontier at capture. Recomputing the
selected cached branch during that flight changes the computed's current
dependencies but leaves the oracle flight's proof obligations intact. Each
unique oracle state reachable within four operations is replayed against B3 in
two capture modes: one reads the roots directly, and one obtains them only through
the warmed cached graph. Both run under `flush`, `sab`, and `eager`.
State-equivalent histories are merged by the oracle key. A separate
[pending-capture-machine.ts](pending-capture-machine.ts) explores a root that is
blocked when a cached consumer and async target first read it, including repeated
reads, target refresh, settlement, failure, and disposal. The report marks
whether a state cap stopped either enumeration.

The October 2, 2026 run reached all 1,129 distinct states under the 1,200-state
cap in each capture mode, covering 2,054 transitions and replaying 1,129
representative histories per scheduler and mode. The pending-capture machine
covered all 41 states and 57 transitions at depth three. All nine B3
capture/scheduler differentials passed. These counts describe fixed topologies
and deterministic values, not arbitrary graphs or unbounded histories. The
report stays correctness-only (`rounds: 0`, with no performance scenarios).
The full snapshot, including completeness bits and source hashes, is in
[correctness-results.json](correctness-results.json).

The cached-only mode found a B3 gap during development: after two branch
changes, previously warmed leaves fed a newly computed diamond outside async
capture, but the new parent cached no hidden roots. B3 could then publish
without validating them. Forwarding a cached child's frontier to an active
parent collector fixed that counterexample; both capture modes now pass.

## Mutation qualification

[b3-mutations.mjs](b3-mutations.mjs) defines nine intentional B3 faults,
including a live frontier reference, missing authority checks, duplicate
diamond validation, publication after a blocker, retained old dependencies,
obsolete settlement, lost hidden frontier, early blocker escape, and skipped
publication validation. [qualify-b3-mutations.mjs](qualify-b3-mutations.mjs)
builds each into a separate disposable bundle, verifies exact mutation anchors,
then runs the same explorer. The unmodified B3 control passed all nine
capture/scheduler runs; the explorer killed all nine mutants. Their first
witnesses and input hashes are in [mutation-results.json](mutation-results.json).

Known A/C composition counterexamples are recorded as failures in the report.
They are not relabeled as passing checks. B2, B and B3 must pass every check;
B1 must also pass evaluation propagation. The default command fails on any
unexpected failure. To require every variant to pass, use:

```powershell
node packages/reflex-async/lab/async-semantics/run.mjs --correctness-only --require-all-pass
```

## Performance method

The runner starts an isolated Node process for every variant and round,
rotates all variants through different positions, and takes seven samples
per round. The default is three rounds. A calibrates each workload's iteration
count; other variants use the same counts and warmup. GC and scheduler flushing happen
outside the timed loop. Every workload checks its returned values.

Measurements include pure sync signal reads, a changing sync graph with and
without a dormant async source, ready and blocked async reads, a cached
async-to-sync chain, and a changing wide sync fanout with one async branch.
The `99.9% ready` cases measure one blocked read per 1,000 iterations.

An additional test-only `experimentalReadResult()` method, injected into every
bundle, compares a tagged source result with the existing throwing read. It
returns pending as a tag before throwing, uses the same cached blocker/wake
promise, and preserves errors and committed `undefined`. Its contract is
checked in the common corpus. In C this separate tagged-source API bypasses
the deferred producer dispatch, so that pair also includes the dispatch cost.

Set `REFLEX_ASYNC_LAB_ROUNDS` to 1–10 to change the number of rounds. The JSON
report contains all raw samples, medians, sample ranges, environment details,
source/experiment/bundle hashes, and correctness counterexamples. Run timings
without concurrent test/build jobs. These are unminified Vite library bundles
on one Node/V8 version; they are not release bundle, browser, allocation or
machine-code equivalence measurements. Small deltas with overlapping ranges
are not evidence of a stable performance change.

## Results and decision

The checked-in [results.json](results.json) is the earlier local performance
snapshot. The expanded correctness and bounded exploration run is recorded in
[correctness-results.json](correctness-results.json); new runs write
`.cache/async-semantics/report.json` or `correctness.json`.

Snapshot: October 2, 2026, Node v25.2.0 on Windows, Intel Core i5-1235U;
three isolated rounds with seven timing samples each.

| Variant | Current correctness run | Known counterexamples in the common corpus                                  |
| ------- | ----------------------: | --------------------------------------------------------------------------- |
| A       |                 72 / 84 | Nested pending, DOM wake, warmed consumer frontier, cached diamond frontier |
| B1      |                 80 / 84 | Warmed consumer frontier and cached diamond frontier                        |
| B2      |                 84 / 84 | None                                                                        |
| B       |                 84 / 84 | None                                                                        |
| B3      |                 84 / 84 | None                                                                        |
| C       |                 72 / 84 | Same four scenario families as A                                            |

The current B3 results include publication-time supersession, dependency
invalidation during another dependency's validation, and blocker/failure
outcomes raised during validation. Its final watcher checkpoint is limited to
asynchronous completion, after the active watcher callback has returned. The
timing table below predates this expanded validation work and is kept as
historical context. The cached-parent frontier fix also changed B3's read
path, so those B3 timings do not describe the current implementation.

For A/C, a throwing initial computation never completes the consumer read
that would connect the downstream edge. Consequently the DOM effect can stay
on its pending text, and a nested async derivation can remain blocked. A
previously warmed computed introduces a separate problem: it can return its
cached value without registering its hidden async source into the downstream
attempt's frontier. In `flush`/`sab`, the downstream result is then published
before the hidden source is validated. In `eager`, these frontier witnesses
instead encounter a propagated blocker. B addresses both mechanisms through
tagged consumer evaluation and frontier replay.

Median time in nanoseconds per workload iteration:

| Workload                                    |      A |     B1 |     B2 |      B |     B3 |      C |
| ------------------------------------------- | -----: | -----: | -----: | -----: | -----: | -----: |
| Pure sync signal read                       |   2.13 |   2.17 |   2.13 |   2.16 |   2.16 |   2.15 |
| Changing sync graph, zero async nodes       |  42.15 |  42.04 |  44.35 |  42.48 |  43.27 |  41.27 |
| Changing sync graph + dormant async source  |  50.85 |  49.28 |  50.59 |  50.26 |  50.36 |  51.46 |
| Ready async read                            |  12.20 |  12.51 |  12.83 |  12.64 |  12.33 |  14.16 |
| Ready async read, tagged result             |  14.05 |  14.09 |  14.44 |  14.47 |  14.22 |  18.52 |
| 99.9% ready reads, throw protocol           |  16.67 |  16.78 |  17.28 |  16.82 |  17.09 |  25.70 |
| 99.9% ready reads, tagged result            |  19.30 |  19.46 |  20.14 |  19.87 |  20.13 |  20.62 |
| Cached async → sync computed chain          |   3.12 |   4.41 |   5.78 |  93.45 |   5.92 |   3.09 |
| Wide sync fanout with one async branch      | 421.81 | 483.50 | 488.34 | 947.87 | 484.05 | 446.85 |
| Async publication through warm sync chain   | 359.92 | 383.72 | 487.90 | 640.98 | 465.29 | 376.43 |
| Async publication through warm sync diamond | 357.51 | 374.06 | 523.14 | 731.70 | 494.68 | 373.13 |

B1 keeps frontier work off the read path and brings the status-only cached
chain to 4.41 ns, though its correctness still fails the cached-frontier cases.
B's per-read frontier validation raises that workload to 93.45 ns. B2 and B3
move frontier work into async capture/publication, to 5.78 and 5.92 ns in this
ordinary sync-read scenario. When the warmed chain is read by an async attempt,
B2 publishes at 487.90 ns and B3 at 465.29 ns; in the diamond those medians are
523.14 and 494.68 ns. B3 reduces both relative to B, but B2/B3 sample ranges
overlap, so this run does not establish a stable B3 speed advantage over B2.

Within A, tagged source reads are about 15% more expensive in the ready and
99.9%-ready cases, and about 3.5 times faster when blocked. C is about 16%
slower on ready reads and 54% slower in the 99.9%-ready case, while retaining
the same four composition failures as A. Pure sync medians differ by only a
few percent with overlapping sample ranges. The tested kernel dispatch adds
no correctness benefit here.

The follow-up separates the semantics that the first B combined: B1 proves
stable evaluation matters; B2 proves the frontier is needed only during async
capture; B3 demonstrates one check for a shared diamond prerequisite at
publication. It gives bounded evidence for these designs without establishing
a final production implementation. Kernel integration remains unsupported by
the tested counterexamples because B2 and B3 express them above the synchronous
producer protocol.

## Verification

The local existing async/optimistic suites passed 112 tests across five files.
Async test typechecking, experiment typechecking, formatting and ESLint checks
passed. The complete facade suite passed 366 of 369 tests; its three failures
are upstream case `#211`, where the test adapter reports an operation outside
`framework.run()` in each scheduling mode. The lab is not imported by that
suite and does not change production code.
