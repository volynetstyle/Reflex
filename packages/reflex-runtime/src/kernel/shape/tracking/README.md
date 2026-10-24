# Read tracking

This document describes how a tracking pass turns the reads of a computation
into the consumer's incoming edge list.

## Problem statement

A pass of consumer `C` produces a read sequence `R`. When the pass completes,
the incoming list of `C` must be `R` with repeated reads removed, in order of
first read, and each pair `(P, C)` must keep its existing edge when it has
one: edge identity decides the position in the producer's outgoing list, and
with it notification and validation order (KERNEL_AUDIT §14).

The earlier statement was positional: walk locality tiers around the cursor,
then scan a bounded prefix for duplicates and the suffix for reuse. Its cost
followed the distance between the cursor and the edge, so a shuffled read
order paid up to 32 prefix links plus 32 suffix links plus two complete
outgoing scans per read.

The current statement starts from the observation that every read asks one
question: where is the edge of the pair `(P, C)`?

| Answer           | Meaning                     | Action                                   |
| ---------------- | --------------------------- | ---------------------------------------- |
| in the prefix    | `P` was already read        | nothing; the cursor stays                |
| in the suffix    | a dependency of an old pass | move the edge after the cursor, stamp it |
| there is no edge | a new dependency            | link a new edge after the cursor         |

The pass stamp separates the first two answers in O(1) (INV-T3), so the
problem reduces to an exact pair lookup. Locality tiers are accelerators of
that lookup, not separate questions.

## Invariants

The tracking cursor is `consumer.tailIn`: the last edge accepted in the
current pass. The prefix is `firstIn..tailIn`, the suffix everything after
it. A pass resets the cursor to `null`; its stamp is the epoch at its first
read and every later read reuses the cursor's stamp.

- **INV-T1.** With a cursor, `firstIn` is in the prefix. The prefix starts at
  `firstIn` and the cursor is in the list.
- **INV-T2.** With the cursor at `lastIn`, every edge of the consumer is in
  the prefix. The suffix is empty. Watcher validation uses this when it sets
  `tailIn = lastIn` to span the committed frontier.
- **INV-T3.** During a pass with stamp `S !== 0` and a nonempty suffix, an
  incoming edge is in the prefix exactly when its stamp is `S`.
  - Prefix edges carry `S`: every path that accepts an edge (sequential hit,
    move, link) writes the cursor's stamp, and nothing moves an accepted edge
    behind the cursor.
  - Suffix edges carry less than `S`: only tracking creates or stamps edges,
    and the suffix holds edges stamped by earlier passes of this consumer
    (a failed pass leaves its prefix stamped and skips cleanup). Each of those
    passes took its stamp before this pass entered tracking, and
    `enterConsumerTracking` advances the clock. The clock only moves forward
    and never repeats a value (INVARIANTS §8, F13).
  - Stamp `0` is never a pass stamp. It appears only on graphs built by hand
    (`linkEdge`, the `trackRead` test helper outside a pass); classification
    then walks the prefix.

`isEdgeInTrackedPrefix` implements INV-T2 and INV-T3. Propagation uses it as
well: a write during a computation marks the computing subscriber only when
the written edge is in its prefix, which used to be a backward walk.

## Pair lookup

`findEdgeInLockstep` (`shape/graph/findEdge.ts`) locates the edge of a pair or
proves there is none. The edge is on both the producer's outgoing list and
the consumer's incoming list. The search first takes four outgoing links
alone (most producers have a few subscribers), then walks both lists in
lockstep: one outgoing link, then one incoming link on each side of the
cursor. It stops when either side finds the edge or is exhausted, so a lookup
costs `O(min(out(P), in(C)) + 4)` links. An exhausted list on either side is
a proof of absence, because each side, together with the edges the caller
already compared, covers its whole list.

This is the limit of the representation, not of the search. For two
unindexed, unsorted adjacency lists, when only traversal and identity
comparison are allowed, membership of the pair `(P, C)` has worst case
Θ(min(out(P), in(C))). Going below it means adding an index (a per-producer
slot, a read-site cache, a hash), which changes the representation rather
than the algorithm.

The incoming side runs outward from the cursor: reorders are usually local,
and the edges next to the cursor are found first.

## Resolution

The hot path in `resolveTrackedRead` is unchanged:

```txt
expected next edge   tailIn.nextIn.from === P   advance the cursor
cursor               tailIn.from === P          consecutive duplicate
first read           firstIn === null / firstIn.from === P
```

Misses are split by kind, so that a call site inlines only the miss kind it
meets (see JIT below).

**Tail miss** (cursor at `lastIn`). By INV-T2 the read is a duplicate exactly
when the edge exists, and stamps are not consulted. Proofs in order: no
outgoing edge, or a sole edge to another consumer, proves a new dependency; a
sole edge to `C`, or the newest outgoing edge pointing to `C` (an edge linked
earlier in this pass), proves a duplicate; otherwise the lockstep lookup
decides. A miss appends after the cursor.

**Inner miss** (cursor inside the list). The bounded reorder tiers stay in
front: the edge one or two links after the expected one, and the consumer's
`lastIn`, are moved after the cursor without a search. Otherwise one lookup
answers both questions: the newest outgoing edge is probed, then the lockstep
search runs from the cursor's neighbours. A found edge with the pass stamp is
a duplicate; any other result goes to reconciliation.

**Initial miss** (first read of the pass, first edge differs). The previous
`lastIn` is moved to the front without a search; otherwise the prefix is
empty and the lookup result goes straight to reconciliation.

**Reconciliation** (`reuseLocatedIncomingEdgeOrLink`) moves a located suffix
edge after the cursor, or links a new edge there.

### Retained policy: eager suffix detachment

When a new edge is linked in front of a suffix of at least 32 edges, the
suffix is unlinked at once, and later reads of its producers link new edges.
This is not a search bound any more; the lookup does not need it. It is kept
because it is observable: a detached edge is replaced by a new edge at the end
of the producer's outgoing list. The rule reproduces the earlier scan exactly,
including its exception: no detachment when the producer has no outgoing
edges and the stamp is nonzero. Removing it is a separate, observable change.

### Configured strategies

`readTrackingStrategy` keeps its contract. A configured strategy is called for
the same reads as before (not a duplicate, not resolved by a reorder tier),
with the same arguments, and returns the new cursor. The default strategy is
recognized by identity and applied to the edge the resolver has already
located; called directly, it runs the same lookup itself.

## Cost

| Read                           | Before                              | Now                                        |
| ------------------------------ | ----------------------------------- | ------------------------------------------ |
| stable, cursor duplicate       | O(1)                                | O(1), same code                            |
| adjacent reorder, tail edge    | O(1)                                | O(1), same code                            |
| append, short outgoing list    | O(1)                                | O(1)                                       |
| duplicate at the tail          | ≤ 4 + 32 + out(P)                   | O(min(out(P), in(C)) + 4)                  |
| distant reorder or duplicate   | ≤ 32 + 32 + 2·out(P)                | O(min(out(P), in(C)) + 4)                  |
| new dependency inside the list | ≤ 32 + 32 + out(P), plus detachment | O(min(out(P), in(C)) + 4), plus detachment |

A permutation of `n` dependencies whose producers have bounded fan-out now
costs O(n) per pass instead of O(32·n).

## Research

Every mainstream fine-grained runtime resolves a read with a cursor and
sequential match; they differ in how they answer the pair question off the
sequential path.

| Runtime                                  | Off-sequence lookup                                                                                                                                    | Duplicate detection                                 | Why not adopted here                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Preact Signals                           | `signal._node`: a per-source pointer to the node of the evaluating target, installed for all sources before a run and restored after (`_rollbackNode`) | `_version !== -1` on the found node                 | O(1) lookup, but an O(deps) prepare and restore walk on every run, also the stable ones, and two extra fields |
| Vue 3.5                                  | `dep.activeLink`, installed in `prepareDeps` with `prevActiveLink`, restored in `cleanupDeps`                                                          | `link.version === -1` marks an unconfirmed old link | same trade as Preact                                                                                          |
| alien-signals 3.2.1                      | none: `depsTail`, `depsTail.nextDep`, then `dep.subsTail`                                                                                              | `dep.subsTail.version === cycle && sub === sub`     | a miss links a new edge; duplicates under interleaving and non-reuse of old edges change edge identity        |
| Angular signals                          | `producersTail` cursor and next link, then the producer's newest consumer link                                                                         | `knownValidAtEpoch === epoch` on that link          | same as alien-signals                                                                                         |
| MobX                                     | none during the run; `bindDependencies` diffs the collected array against the old one with the `diffValue` mark                                        | `observable.lastAccessedBy_ === runId`, one slot    | rebuilds the list after every run                                                                             |
| Self-adjusting computation (Acar et al.) | traces are reused by reordering slices with order-maintenance bookkeeping                                                                              | timestamps in a total order                         | the stamp test here is the degenerate case: one pass, two classes, a forward-only clock                       |

Two ideas carried over. The stamp on the link (Angular's `knownValidAtEpoch`,
alien-signals' `version`) is already Reflex's pass stamp; INV-T3 makes it a
complete prefix test rather than a fallback after a bounded scan. The
producer's newest link (`subsTail`, `consumersTail`) is the newest-outgoing
probe. The per-source pointer of Preact and Vue would give O(1) worst-case
lookup, but needs a node field, a rollback field and a walk over all
dependencies of every run; it remains an option for a specialized mode, armed
lazily on the first non-sequential miss, if profiles ever show a workload
where both lists of a pair are long.

Sources:

- Preact Signals, `packages/core/src/index.ts`:
  https://github.com/preactjs/signals/blob/main/packages/core/src/index.ts
- Vue, `packages/reactivity/src/dep.ts` and `effect.ts`:
  https://github.com/vuejs/core/tree/main/packages/reactivity/src
- alien-signals 3.2.1, `link` in `esm/system.mjs` (the reference runtime of
  `bench/reference`): https://github.com/stackblitz/alien-signals
- Angular, `packages/core/primitives/signals/src/graph.ts`:
  https://github.com/angular/angular/blob/main/packages/core/primitives/signals/src/graph.ts
- MobX, `core/derivation.ts` and `core/observable.ts`:
  https://github.com/mobxjs/mobx/tree/main/packages/mobx/src/core
- R. Ley-Wild, U. Acar, G. Blelloch, "Non-monotonic Self-Adjusting
  Computation", ESOP 2012:
  https://software.imdea.org/~rleywild/publications/esop12/esop12.pdf

## The joint tail and the producer slot

Lockstep is expensive only for an edge whose two endpoints are both wide,
`out(P) ≫ 1 ∧ in(C) ≫ 1`, and only when the read leaves the sequential path.
A wide producer read by a narrow consumer, or a narrow producer read by a
wide consumer, costs `min` links. The working hypothesis is that dependency
graphs are sparse and skewed: most edges have a small endpoint, and a few
hubs have a large fan-out or fan-in. Reported support: a study of about
20,000 EUSES and Enron spreadsheets found an average fan-out below 5 for most
spreadsheets beside a tail of hubs; Solid 2 diagnoses 2,000 subscribers as
`HUGE_FAN_OUT` and wide fan-in separately; Vue treats one render reading
100,000+ properties as a special case. None of these measures the joint
distribution of `(in, out)` per edge, which is what lookup cost depends on.

`perf/tracking-pair-lookup/analyze.mjs` measures it on the runtime, per read
that reaches the lookup: `D = min(out(P), in(C))`, links compared, and the
hit rate of a simulated single producer slot (`P.trackEdge`, a positive
cache: a hit is verified by `edge.to === C` and liveness, a miss proves
nothing and pays the lookup, so nesting cannot break correctness, only the
hit rate). Results of 2026-10-24 (512 producers, fan-out 64, consumers read
all 512 in a fresh order per pass):

| Workload                             | Reads reaching lookup | Links/read | Slot hit: fill on lookup / every read / arm | Links/read, arm slot |
| ------------------------------------ | --------------------: | ---------: | ------------------------------------------- | -------------------: |
| 1 consumer                           |                   96% |         75 | 0.995 / 0.995 / 1                           |                  2.0 |
| 8 consumers, fixed order             |                   95% |         75 | 0 / 0 / 1                                   |                  2.0 |
| 64 consumers, shuffled order         |                   93% |         69 | 0 / 0 / 1                                   |                  1.9 |
| 8 consumers, nested passes every 128 |                   96% |         75 | 0.03 / 0.03 / 0.85                          |                 13.0 |
| all 25 timed workloads of `bench/`   |                    0% |          0 | -                                           |                    - |

Timing (`compare-tracking-graph.mjs`, previous resolver → lockstep): the
wide × wide modes improve 2.7–3.5×, but cost 290–370 ns per read against
18 ns for a 512-read permutation at fan-out 3, so the joint tail stays about
16–20× more expensive per read.

Reading of the data:

- A slot filled on use thrashes as soon as two consumers share producers.
- A slot re-armed on the first lookup of a pass (write the slots of all of
  `C`'s edges, `in(C)` stores) survives interleaving. It is the
  prepare walk of Preact and Vue, done lazily and without a rollback.
- The armed slot is therefore not a cache of the last pair but lazy
  per-pass indexing: one generic miss writes Θ(in(C)) slots. For a pass of
  `n` reads with a share `p` of lookups, lockstep does about `p·n·D` link
  comparisons and the index about `n + p·n` operations, so it pays off only
  when `p·D ≫ 1` (the stress test: `p ≈ 0.95`, `D = 64`, `p·D ≈ 61`).
- No benchmark workload reaches the lookup at all; the cost exists only in
  the joint tail, and no corpus of applications has shown that tail.

Decision: lockstep is the architecture. The armed slot is the measured
candidate if a profile of a real application shows a high lookup share with
large `D` (`analyze.mjs` reports both). It costs a field on every node, and
it changes the representation by adding an index, not the algorithm. Only a
single slot is considered; a multi-way cache is out of scope.

## Verification

- Graph-level differential fuzz against the previous resolver: random passes
  over up to 124 producers and 4 consumers (shuffles, swaps, insertions,
  drops, duplicates, nested passes that advance the epoch mid-pass, producer
  disposal, failed passes without cleanup). Each snapshot compares incoming
  and outgoing order, edge identity, stamps and the cursor. 200,000 scenarios,
  no difference. The same fuzz distinguishes both oracle mutants below.
- Oracle qualification mutants: `prefix-stamp-classification-false`
  (duplicates taken for suffix edges) and `reconcile-skip-eager-detach`.
- `runtime.tracking-prefix.test.ts`: lookup and classification against brute
  force on passes that satisfy INV-T3, including stamp 0.

## JIT

Keep each tier's code where its frequency is. TurboFan charges a caller for a
callee's bytecode plus everything already inlined into the callee's optimized
code, against a fixed budget per compilation. A cold tier merged into a hot
function is inlined wherever the function is, and can push the hot read path
(`resolveTrackedRead`) out of `runWatcherCore`, `advanceCore` or
`executeComputation`. For that reason the tail miss and the inner miss are
separate functions: a call site inlines only the miss kind that occurs there.
The lookup is a plain loop and is not unrolled.

## Comparing tracking and graph performance

The comparison script snapshots the compiled internal entrypoint with production
flags and tree shaking. It alternates independent Node processes for baseline
and candidate, with 10,000 warmup passes, 20,000 measured passes and nine samples
per variant. Dependency orders are prepared outside the timed loop, and each
pass takes a fresh stamp from the clock as a real pass does. Results include
raw samples, Node version and CPU information.

Run from the repository root, saving the baseline before editing the runtime:

```sh
pnpm --filter @volynets/reflex-runtime build:ts
node scripts/compare-tracking-graph.mjs --save baseline
# Apply the runtime changes, then rebuild.
pnpm --filter @volynets/reflex-runtime build:ts
node scripts/compare-tracking-graph.mjs --save candidate
node scripts/compare-tracking-graph.mjs baseline candidate
```

Snapshots and the report are written to the ignored `temp/tracking-graph/`
folder. Workloads cover stable and duplicate reads, rotations, permutations at
fan-out 1, 3 and 8 with the consumer's edge at the start, middle or end of the
producer's outgoing list, reversals, pair swaps, branch swaps in the middle of
the list, shared producer appends, incoming-edge moves, direct and scanned edge
reuse, and an end-to-end consumer recomputation. Interpret individual timings
alongside the unchanged stable-tracking and generic-move controls.
