# Reflex runtime kernel audit

Companion to `SEMANTIC_CHARACTERIZATION.md` (states, transitions, invariants
I1–I10, hidden preconditions H1–H4, findings F1–F13). This document answers,
per kernel segment, which states are reachable, which checks are needed,
what earlier stages already guarantee, what repeats, what is historical, and
which specializations the measured branch statistics justify. Every change
made on its basis is listed in §12 with its proof, measurement and rollback.

Method:

- **Reachability** comes from proofs in the code, the state census of the
  baseline oracle (3000 generated programs, `SEMANTIC_CHARACTERIZATION.md` §2),
  throwing probes run under the full suite and the oracle (2000 seeds × 2
  levels), and the branch census below.
- **Branch statistics** come from `bench/census.mjs`: a PROFILE build counts
  semantic projection events per workload step (§11).
- **Timing** comes only from `bench/compare.mjs` (paired in-process A/B with
  an A/A′ control, shipped Terser output, `--predictable`). CPU profiles of a
  readable production build locate cost; they never support a claim.
- A check is called redundant only with a proof, and a branch unreachable
  only with a proof plus a probe that never fires.

## 1. Graph shape and flags (`shape/`)

**Reachable states.** Producers: clean only (I1). Consumers at rest: clean,
`Unknown`, `Changed` (I2); during their callback additionally `Computing`
and, from reentrant writes, `Visited | Unknown` or `Changed`. Watchers: 21
sets over `{Unknown, Changed, Visited, Watcher, Scheduled, CleanupPending}`
at rest, `Computing` during validation and execution. `Disposed` (bit 6) is
never set (F2). `Producer`/`Consumer` are 0 in production.

**V8.** Every node is a `ReactiveNode` whose eight fields are initialized in
one order (class fields, then the constructor), so producers, consumers and
watchers share one hidden class and kernel loads stay monomorphic. Edges are
object literals with the same key order at all four creation sites
(`createReactiveEdge`, `linkEdge`, `linkFirstTrackedEdgeUnchecked`,
`appendTrackedEdgeAfterCursorUnchecked`) and share one map. `version` holds a
Smi until the epoch passes 2^30 and a heap number after; with F10 fixed the
field generalizes once instead of alternating between int32 and uint32
values. Keeping it a Smi forever would need a 30-bit epoch domain and new
serial-number comparisons: rejected, the benefit starts after 10^9 passes.

**Kept.** `Disposed` stays exported (internal API); removing it is an API
change with no runtime benefit.

## 2. Write and propagation (`protocol/write.producer.ts`, `stages/propagation/push_iterator.ts`)

**Reachable states of a direct subscriber.** clean; `Unknown` (transitively
dirty consumer); `Changed` (already dirty); watcher sets with or without
`Unknown`; and any of these plus `Computing` when the subscriber is running.

**Branches and their guards** (phase 1, in order):

| Branch | Condition                                     | Needed because                                    |
| ------ | --------------------------------------------- | ------------------------------------------------- |
| b1     | no evidence, not computing → `Changed`        | dominant case                                     |
| b2     | `Unknown`, not watcher → replace by `Changed` | I2 (consumers never rest as `Unknown \| Changed`) |
| b3     | `Computing` → `markComputingSubscriber`       | reentrant write into a running callback           |
| b4     | watcher with `Unknown` → add `Changed`        | watcher evidence is two obligations (V5)          |
| —      | otherwise (already `Changed`) → skip          |                                                   |

b2 is tested before b3, so a _computing computed_ that carries `Unknown`
(entered through validation) takes b2: it gains `Changed` without the prefix
check and its subscribers are marked transitively. Reordering b2 and b3
would change those transitive marks, which the strict oracle observes;
kept. Moving the "already `Changed`" skip first would save two predictable
tests on repeated writes into a dirty consumer and add one to every other
case; not worth a change without a measured distribution shift.

**Guaranteed by earlier stages.** `writeProducer` reaches push only with a
changed value and a non-empty subscriber list; push needs no null check on
its argument. Producers never carry evidence (I1), so push never has to
reason about its source.

**Repeated work.** None in the loops: `edge.to`, `sub.state` and
`sub.firstOut` are each read once per visit. The stack is shared and
re-entrant (`base`/`high` slices), slots are nulled on pop, so it retains no
nodes after a wave; capacity is trimmed back to 512 at the outermost exit.

**Slow paths.** `markComputingSubscriber` (backward scan to decide whether
the edge lies in the tracked prefix) is isolated. Replacing the scan with a
stamp comparison (`edge.stamp === sub.tailIn.stamp`) was considered and
rejected: it is exact only modulo epoch wraparound, and watcher validation
sets `tailIn = lastIn`, where stamps do not describe the prefix.

**Propagation scope.** Only `writeProducer` enters a propagation scope in
production; nested writes (from hooks) propagate inside the outer scope, so
the depth is 0 or 1 outside tests. See §12 H8.

## 3. One-step propagation after recompute (`stages/propagation/push_iterator_once.ts`)

**Reachable states.** Same as §2 plus a running reader: a computed reader
has `Computing`; a running watcher keeps `Changed` throughout execution, so
the walk skips it (no self-delivery, F8/I8).

**Correction (F17).** The argument above covers the execution epoch only. A
watcher in `pull_frontier` holds `Watcher | Unknown | Computing` without
`Changed`, and the host has already released `Scheduled`. An `advance` inside
the proof whose node has a side edge into that watcher therefore reached the
delivery branch. The owned parent edge excluded only the walker's own edge,
so the old proof held for trees, not for DAGs. The delivery guard now tests
`Scheduled | Computing`. The bit test sits inside the watcher-and-hook branch,
so the computed path through this walk is unchanged.

**Owned edge.** The pull walker passes the edge it owns; the walk marks all
other subscribers. A foreign or unlinked `skip` is never matched, and every
edge is visited. The three copies of the subscriber update (plain walk, and
a skipping walk split around `skip`) are one function now (§12).

**Hidden precondition H1.** The read path `should_recompute → advance(node)`
passes no owned edge and marks an `Unknown`-entered computing reader
`Changed`; `advanceCore` discards that mark. Passing the owned edge there
instead was analysed and rejected: an unmarked reader would later take b2
instead of b3 on a direct write (§2), changing transitive marks.

## 4. Dependency tracking (`stages/tracking/`, `shape/graph/`)

**Reachable states.** During a pass `tailIn` is null (nothing accepted yet)
or an edge of the consumer's incoming list; the prefix up to `tailIn` holds
the edges accepted in this pass, all stamped with the pass stamp; the suffix
holds the previous dependencies.

**Stamp.** The pass stamp is the cursor edge's stamp, or the current epoch
for the first read (INVARIANTS §4). Before H2 every caller computed it
(`consumer.tailIn?.version ?? trackingStamp`) and `resolveTrackedRead`
reloaded `tailIn`; the resolver now derives it (§12 H2). The cursor-hit
store `cursorEdge.version = producerVersion` wrote the value it had just read
and is gone. F10: edge creation stored `version | 0`, reuse stored the uint32
epoch; past 2^31 one pass carried two stamps (fixed).

**Tiers** (`resolveTrackedRead`): next-edge hit, cursor hit (consecutive
duplicate), first hit, empty list; cold: append, one-hop and two-hop
reorder, last-edge shortcut, prefix duplicate (bounded 32-edge scan with a
version fallback), slow strategy. Their measured frequencies are in §11.

_Superseded (2026-10-24):_ the prefix duplicate test and the default
strategy's suffix scan are replaced by one exact pair lookup
(`findEdgeInLockstep`, bounded by the shorter adjacency list) and a stamp
classification (INV-T3, `isEdgeInTrackedPrefix`). The produced graph is
identical, including eager detachment; see the tracking README.

**Unreachable or dead.** `allowSlowPath = false` had no runtime caller (F3,
removed with H2). The empty-suffix exit of `cleanupUnvisitedSources` is
unreachable from both callers, which require `tailIn !== lastIn` (I5/F4);
kept as a defensive no-op because `cleanupUnvisitedSources` is exported. The
suffix-head hit (R0) of the default strategy is unreachable through the
resolver (F5) but reachable through the public strategy API; kept.

**Heuristics that touch identity, not semantics.** The default strategy
detached the whole stale suffix after a 32-edge miss. Later reads that would
have matched it linked new edges instead of reusing old ones; the effect was
a different edge identity, never a lost dependency. _Removed (2026-10-25):_
the suffix now survives until cleanup; the oracle compares adjacency order
and sibling delivery order as representation (SEMANTIC_CONTRACT).

## 5. Consumer read and stabilization (`protocol/read.consumer.ts`)

**Reachable states at entry.** clean (fast path), `Changed`, `Unknown`. A
computed never rests with `Visited` (I3), so `FORCE_RECOMPUTE_STATE =
Changed | Visited` decides exactly like `Changed` for valid states; the extra
bit costs nothing and is kept.

**Redundant guard.** `if (!stabilized) node.state &= ~Both` is needed only
when an `Unknown` consumer has no inputs (F9): `advance` returning `false`
already left a resolved state, and `should_recompute` returning `false`
cleared `Unknown` itself. Narrowing it saves one read-modify-write per
stabilization; not done, no measurable gain expected.

**Duplication.** `readConsumer(node, mode)`, `readConsumerLazy` and
`readConsumerEager` repeat a small body. They are public entry points;
sharing the body would add a call level on the clean read. Kept. (DEV only:
`readConsumerEager` records no read event, `readConsumer(node, eager)` does.)

**F9.** An `Unknown` consumer without inputs is clean as a root and
recomputed as a dependency (`pull_frontier`, `pullDependencyDirty`,
`pull_iterator`). Contract open; pinned by the oracle.

## 6. Validation (`stages/stabilization/pull_dependency.ts`, `pull_iterator.ts`)

**Policy.** `should_recompute` stops at the first proven change; a
dependency's `Changed` advances it, an `Unknown` dependency with inputs is
walked by `pull_iterator`, an `Unknown` leaf is advanced.

**Unreachable branch (F11, removed).** In `pull_iterator`, `top > base`
holds whenever `descend` runs: the parent edge is pushed first, descend only
pushes, unwind resumes a sibling only while frames remain. `top !== base` in
the descend head was always true and the `top === base` exit unreachable; a
throwing probe never fired under the full suite and the oracle.

**Needed checks.** The descend-head `Changed` test is redundant right after
a descend (the node was just seen without `Changed`) but required after
`continue traverse`, when user code under an earlier sibling may have marked
the resumed parent; one test per step, kept. `high = top` before each
`advance` publishes the live slice for reentrant walkers (I9). The
`try/finally` clears owned slots on throw (I9).

**Statistically justified specialization.** `pull_frontier` fuses the clean,
`Changed` and `Unknown` cases for wide watcher frontiers instead of calling
`pull_dependency` per edge; `pull_dependency` remains exported but has no
runtime caller.

## 7. Recompute (`stages/stabilization/advance.ts`)

**Reachable entry states.** `Changed` (forced) or `Unknown` (validated);
never `Visited` for computeds (I3).

**Dead in production.** `node.state = computingState & ~Computing` before
suffix cleanup is overwritten by `resolvedState` with no reader in between
(no user code runs; cleanup touches edges only). DEV debug events snapshot
`node.state` there, so it is observable in DEV traces; kept because the
store is on the dynamic-dependency path only and no gain is measurable.

**H1.** The final state comes from the pre-compute evidence; marks made
during compute are discarded. Documented as a hidden precondition; F1 is the
semantic consequence.

**Duplication with watcher execution.** `executeComputation` repeats the
tracking prologue and epilogue with different failure and result handling.
Sharing them would add a call level to every recompute; kept.

## 8. Watcher validation and execution (`engine/watcher.ts`, `stages/stabilization/pull_frontier.ts`)

**Reachable entry states.** clean (skip), `Changed` (execute), `Unknown`
with or without `Changed`/`Visited` (validate the whole frontier, then
execute if anything changed or execution was already owed).

**Needed checks.** `node.compute === undefined` after validation, after
cleanup and after execution: a callback may dispose its own watcher. The
error paths (`recoverWatcher*`) restore schedulable states; the frontier
scan on computation error runs only after an exception.

**Repeated writes.** Between `pull_frontier` returning and the first user
code (cleanup or callback) `node.state` is read-modified-written up to four
times. DEV events observe intermediate values. See §12 H10.

## 9. Lifecycle (`shape/graph/disposeNode.ts`, `sweepEdges.ts`, `disposeWatcher`)

`disposeNode` unlinks both directions and clears `compute`/`payload`; flags
are untouched (documented). `unlinkAllSubscribers` repairs `to.tailIn`
because a producer may be disposed while a reader is computing. Unlinked
edges have their four list pointers cleared; `from`/`to` remain, but the
edges are unreachable from live nodes, so nothing is retained. The
retention workload (`E.retention.subtree-churn`, slope between 2000 and 8000
mount/unmount cycles, median of 5 runs) measures about −1 byte per cycle on
both sides of every comparison: no growth.

## 10. Execution registers and settlement (`state.ts`, `context.scope.ts`, `batch.ts`)

**Registers.** `currentConsumer`, `trackingStamp`, `propagationScopeDepth`,
`reactiveBatchDepth` and `runtimeState` are exported module bindings; each
access goes through a module variable cell. The `Tracking` bit of
`runtimeState` is redundant with `currentConsumer !== null` (every writer
keeps them in step) and is maintained on every compute; it is also part of
the public `RuntimeContextSnapshot`. See §12 H9.

**Settlement.** Without hooks and without pending host work, `leave` and
`emitSettledIfIdle` exit on one combined test in production.

## 11. Branch census

`node bench/census.mjs --steps 2000` on b290ac7: semantic projection events
per measured step after setup (PROFILE bundle; the step is the workload's
unit of work). Rows list the workloads where a branch fires at all.

**Tracking resolution.**

| Tier                                                 | Where it fires (per step)                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| first-hit (first read of a pass, first edge matches) | every reading workload; chain-1000 999.5, list 334, diamond 65                              |
| next-hit (edge after the cursor matches)             | stable-8 7.0 of 8.0, fanin-100 94 of 95, diamond 63 of 128, batch 31 of 32, list 168 of 535 |
| cursor append (new dependency)                       | list 33 of 535, mount-unmount 4 of 20, retention 4 of 20                                    |
| initial create (first edge of a new node)            | mount-unmount 12, create-dispose 1                                                          |
| one-hop, two-hop reorder, last-edge shortcut         | reorder-8 only (built for it)                                                               |
| cursor hit, prefix duplicate, slow strategy          | 0 in every workload                                                                         |

The resolver's tier order (next, cursor, first, empty, then cold) matches
the distribution; no reorder is justified. The duplicate and slow tiers are
correctly cold.

**Propagation.** A write marks its direct subscribers `Changed` (b1/b2) in
every workload; transitive `Unknown` marks are one per level in chains, 57 in
diamond, 300 in list. Already-dirty skips dominate only in
`C.selective.read-12-of-256` (244 skips against 12 marks per step); every
other workload marks more than it skips, so moving the skip test first
(§2) is not justified. `markComputingSubscriber` runs 0 times in every
workload: reentrant writes into a running consumer are a correctness path,
not a performance path, and its isolation is right. The push stack never
needs trimming.

**One-step propagation.** `push_iterator_once` runs only in diamond (56 per
step, one owned-edge skip per walk). In every pull bubble of chains, watcher
waves and list, the recomputed node's only subscriber is the walker's owned
edge, and `advance` returns without a walk (`owned-edge-only-skip`: chain
one per level, wave 256, list 134). That shortcut is the statistically
dominant propagation outcome after a pull recompute; kept.

**Validation.** `pull_iterator` runs only in chains, diamond, cutoff and
list: one descent and one changed bubble per level. A stable sibling scan
appears only in list (33 per step). In chain-1000 the walker stack grows to
about 1000 frames and is trimmed back to 256 at the end of every step: a
memory policy that costs re-growth each step; kept (§12).

**Recompute.** Suffix cleanup runs only in list (33 of 266 recomputes): the
dynamic-dependency path, where the dead interim store of §7 sits, is cold.
Unchanged results (cut-off) appear in reorder-8, cutoff, list (132 of 266).

**Watchers.** `pull_frontier` meets one changed dependency per watcher in
wave-256; in list it scans 200 clean, 100 invalid and 100 changed
dependencies per step, and 132 of 200 watchers end stable (no execution).

**Reads.** A dirty consumer read is almost always a forced advance (direct
`Changed`); validation (`should_recompute`) runs once per step in chain,
diamond and cutoff.

## 12. Changes and tested hypotheses

Every timing is `bench/compare.mjs` against the parent commit (paired A/B,
A/A′ control inside the interval, shipped Terser output, `--predictable`,
family 25). "Equivalent" means the interval lies inside ±3%.

**Committed.**

| Commit  | Change                                                                                                               | Proof                                                                                                                      | Measured                                                                                             | Rollback            |
| ------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------- |
| 9b21f58 | F10: edges stamped in the uint32 epoch domain at all four creation sites                                             | regression test at epochs 1000, 2^31−16, 2^32−16; oracle divergences 10 of 4000, topology only; oracle re-pinned (242027a) | not a performance change                                                                             | revert both commits |
| 4573a9c | F11: unreachable root case removed from `pull_iterator`                                                              | loop invariant `top > base` in descend; throwing probe never fired under suites and oracle                                 | neutral                                                                                              | revert              |
| 3b0c1f3 | H3: one walk for one-step propagation with an optional owned edge (three copies of the subscriber update become one) | the skipping walk equals the plain walk minus the owned edge; oracle                                                       | neutral                                                                                              | revert              |
| b290ac7 | H2: the resolver derives the pass stamp; dead `allowSlowPath` (F3) and the cursor-hit self-store removed             | all four callers computed the same stamp right before the call                                                             | stable-8 −11.3%, reorder-8 −6.1%, fanin −13…−22%, wave-256 −10.4%, untracked read −7.2%; none slower | revert              |
| 29ddb02 | O1: `pull_iterator` tests the walked node only on traverse entry and after a stable `advance()`                      | inside the scan only `advance()` runs code; after a descent the node's state was just read                                 | cutoff −6.1%, chain-100/1000 −2.2…−2.4%, chain-10 +2.3% (layout, see commit)                         | revert              |
| 26b1b65 | PROFILE path observers in one module (`stages/profile.ts`)                                                           | production bundle byte-identical                                                                                           | none                                                                                                 | revert              |
| bb5fc5f | F12: the DEV propagation stack peak is recorded; the DEV memory test now grows the stack past 512 frames             | the test fails without the walker change (peak 0)                                                                          | production bundle byte-identical                                                                     | revert              |

**Measured and rejected.**

- H10, folding the watcher's post-validation read-modify-writes into one
  store: equivalent on every watcher workload (wave-256 −1.5%, interval
  inside the band). The fields are written with no call in between, so the
  optimizer already forwards them; reverted.
- O2, publishing the validation stack mark `high` only before a bubble
  `advance()` instead of on every pop: cutoff −1.4% [−2.1, −1.1], every other
  workload equivalent. The gain is inside the band and the change adds an
  invariant a later edit could break silently (a stale mark between pops
  stays harmless only while the stable pop runs no user code); reverted.
- H9, deriving `Tracking` from `currentConsumer` instead of writing the bit
  twice per recompute: upper-bound experiment (writes removed, readers
  unchanged) gave chain-10 −9.4%, chain-100 −5.1%, fanout-1000 −8.2%,
  fanout-100 −4.7%, wave-256 −3.6%. The full change (readers switched to
  `currentConsumer !== null`, `readRuntimeState()` for snapshots and
  diagnostics) passed every suite and the oracle; its full measurement was
  stopped and the change is deferred, not committed.
- H8, specializing the propagation scope of `writeProducer` (depth is 0 or 1
  in production): an upper bound without any scope bookkeeping adds nothing
  measurable beyond H9 on graph workloads (§14); rejected.
- O3, testing the inert-settlement condition in `writeProducer` before
  calling `emitSettledIfIdle` (exactly the first test of that function):
  write without subscribers −7.2%, everything else unchanged. It duplicates
  the settlement predicate in two modules for 0.2 ns on writes to
  unobserved producers; reverted.

**Rejected by analysis** (no experiment: the change is not equivalent, or
its effect is below the resolution of the protocol).

- Prefix test in `markComputingSubscriber` by stamp comparison: exact only
  modulo epoch wraparound, and watcher validation sets `tailIn = lastIn`,
  where stamps do not describe the prefix. It never runs in the workloads.
- Passing the owned edge on the read path `should_recompute → advance`:
  an unmarked computing reader would later take b2 instead of b3 (§3).
- Reordering b2 and b3 in push: changes transitive marks; the strict oracle
  observes it. Moving the "already Changed" skip first: only one workload
  skips more than it marks (§11).
- Removing the interim store before suffix cleanup in `advanceCore`: dead in
  production, observed by DEV traces, on a path taken by 12% of recomputes
  in the only dynamic workload.
- Narrowing `node.state &= ~Both` after a failed stabilization (§5): one
  read-modify-write on a path that just ran a recompute.
- A 30-bit Smi epoch: needs a new comparison domain; benefit starts after
  10^9 passes.
- Raising the pull stack retention floor (chain-1000 re-grows about 750
  frames each step): a memory policy, not a correctness or hot-path issue.

## 13. Organization review

**Wrappers and call levels on the hot path.** Every DEV wrapper
(`pushIteratorDev`, `advanceDev`, `shouldRecomputeDev`, `pullDependencyDev`,
`pushIteratorOnceDev`, the watcher run wrapper) is chosen at module load by
`__DEV__ ? wrapper : core`; production binds the core function directly, so
no wrapper adds a call level. `enterPropagationScope` is the register
function itself outside PROFILE builds. No hot-path wrapper was found to
remove.

**Duplication between hot and cold paths.** Kept where sharing would add a
call level to a hot path: `readConsumer`/`readConsumerLazy`/
`readConsumerEager` (§5), the tracking prologue of `advanceCore` and of
watcher execution (§7). Removed where it had no runtime role: three copies of
the one-step subscriber update (H3) and two copies of the PROFILE degree
counters (26b1b65).

**Mixed responsibilities.** `stages/stackStats.ts` holds both DEV statistics
and the production retention policy of the validation stack
(`STACK_TRIM_MIN_CAPACITY`, `trimWalkerStackToFloorIfSparse`), while the
propagation stack keeps its own policy inline (preallocated 512 slots,
trimmed back to 512). The name `trimWalkerStackToFloorIfSparse` claims a
sparseness test it does not perform, and `noteResumeEdgeStackUsage` /
`resumeEdgeStack*` are historical names for the propagation stack. All are
exported through `./internal`; kept, recorded here. The DEV propagation peak
was never recorded (F12, fixed in bb5fc5f).

**Exported without a runtime caller.** `pull_dependency` (fused into
`pull_frontier` and `should_recompute`), `push_iterator_once_skipping`
(alias of `push_iterator_once`), `trimWalkerStackIfSparse`. Internal API;
kept.

**Registers.** The `Tracking` bit of `runtimeState` duplicated
`currentConsumer !== null` and was written twice per recompute (H9). It is
a candidate for derivation (deferred, §12).

**Names.** `stages/first` and `stages/second` name the order of two phases,
not what they do: `first` is propagation (push invalidation), `second` is
stabilization (validation and recompute). See §12 for the rename.

## 14. Efficiency limit of the execution model

**Reference.** `bench/reference/alien.mjs` runs the same workloads on
alien-signals 3.2.1, which implements the same push-dirty / pull-validate
model with cursor-based dependency tracking. Paired comparison against
53b1367 (12 replicates; Δ is alien relative to Reflex, positive = alien
slower; only workloads whose `verify()` agrees on both runtimes):

| Area                | Workloads                                                         | alien relative to Reflex       |
| ------------------- | ----------------------------------------------------------------- | ------------------------------ |
| Dependency tracking | track.stable-8, track.reorder-8, fanin-10/100/1000                | +56%, +92%, +89%, +156%, +165% |
| Selective reads     | selective.read-12-of-256                                          | +31%                           |
| Traversal           | chain-100, chain-1000, cutoff, fanout-100                         | within ±5%                     |
| Fan-out             | fanout-10, fanout-1000                                            | +6%, +12%                      |
| Entry points        | write without subscribers, equal write, untracked and clean reads | −52%, −19%, −8%, −5%           |
| Short chains        | chain-10, diamond                                                 | −20%, −5%                      |

The traversal and tracking algorithms are at or beyond the reference. The
remaining gap is fixed cost at operation boundaries.

**Where the fixed cost is.** An upper-bound commit removes all lifecycle
bookkeeping on the hot path (the `Tracking` bit writes per recompute, the
propagation scope around a write, the settled check of a write without
subscribers). Against 620f708: tracking −6…−9%, fan-out −4…−9%, chains
−3…−5%, watchers −4%, write without subscribers −44%; reads and equal
writes unchanged. Against alien the bound closes the write gap to −7% and
chain-10 to −9%. The `Tracking` bit alone (H9, measured before) accounts
for nearly all of the graph-workload share; the scope and settle parts add
nothing measurable beyond it, so H8 is rejected. The −44% on a write
without subscribers is not reachable by an equivalent change: testing the
inert-settlement condition before the call (exactly the first test of
`emitSettledIfIdle`) gains 7%; the rest disappears only when the function
loses its tail entirely, an inlining effect of the microbenchmark.
`Object.is` (NaN and ±0 semantics) explains the equal-write gap.

**Hidden invariants, proved, with what they allow.**

| Invariant                                                                                 | Proof sketch                                                                                          | Allows                                            | Status                                |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------- |
| `runtimeState & Tracking` ⇔ `currentConsumer !== null`                                    | every writer of `currentConsumer` updates the bit in step; a context load restores both from one save | derive the bit; −3…−9% on graph workloads         | implemented and tested (H9), deferred |
| propagation depth ∈ {0, 1}; `Propagating` ⇔ depth ≠ 0                                     | only `writeProducer` opens a scope, only at depth 0; snapshots restore only at quiescent boundaries   | specialize enter and leave                        | no gain beyond H9; rejected           |
| INV-T1: with a cursor, `firstIn` is in the tracked prefix                                 | the prefix runs from `firstIn` to the cursor                                                          | `firstIn.from === P` alone proves a duplicate     | candidate, part of the F13 fix        |
| INV-T2: with the cursor at `lastIn`, every edge P→C is in the prefix                      | the suffix is empty; at most one edge per pair                                                        | duplicate test = existence of P→C, without stamps | implemented (tail miss, 2026-10-24)   |
| INV-T3: with a nonempty suffix and stamp S ≠ 0, an edge is in the prefix iff it carries S | accepts stamp S; suffix stamps come from earlier passes; the clock only moves forward (F13 fixed)     | O(1) prefix test for any located edge             | implemented (tracking README)         |
| At rest, the incoming edges of a consumer carry its last pass stamp, unless a pass failed | each pass stamps what it accepts and cleanup removes the rest; a failed pass skips cleanup            | an O(1) collision test in the cold fallback       | candidate, part of the F13 fix        |

**Hypotheses falsified.**

- _Edge stamps can go._ They are read only by cold duplicate detection, but
  without them a distant duplicate read costs a prefix walk: reading `a[i]`
  and then `a[i − 40]` in a loop becomes O(n²) per computation instead of
  O(fan-out) per read. Stamps are justified.
- _The one-hop, two-hop and last-edge reorder tiers are pure accelerators of
  the generic strategy._ A differential run with the tiers compiled out
  diverges in 2 of 3000 oracle programs at both levels. Both divergences are
  F13: without the tiers the generic path reaches the stamp fallback more
  often.

**F13 (defect).** When the pass stamp equals a stale stamp still carried by
a suffix edge, the version fallback of the duplicate test (after the
32-edge prefix scan misses) takes the stale edge for an accepted one. The
read is dropped, cleanup unlinks the edge, and the dependency is lost:
later writes to that producer leave the consumer stale. Reproduced on the
shipped code: 40 sources, the epoch rewound with `setTrackingStamp` so the
next pass repeats the previous stamp, a reorder that defeats the next,
one-hop, two-hop and last-edge tiers; after a write to the dropped source
the consumer returns 633 instead of 1595. Natural occurrence needs the
epoch to wrap exactly onto the previous stamp of the consumer (about 2^−32
per recompute of a consumer idle for at least 2^32 passes);
`setTrackingStamp` makes it deterministic. The baseline shares the defect,
so the oracle cannot see it.

**Conclusion.** Within the current model and its observable contract
(including edge identity and order, which decide notification and
validation order), the kernel is at the reference cost on traversal and
below it on tracking. The only remaining equivalent gain with a measured
effect is H9. Large simplifications of tracking are blocked by
observability: which edge is reused decides the subscriber order.
