# Read tracking

How a tracking pass turns the reads of a computation into the consumer's
incoming edge list. The full description, with invariants and their proofs,
the lookup bound, prior art, measurements and the slot decision, is in
[RESEARCH.md](./RESEARCH.md). This file is the working summary.

## Model

The cursor `consumer.tailIn` splits the incoming list into the prefix
accepted in this pass and the suffix of older dependencies. A read off the
sequential path is resolved in three steps:

1. **Locate** the edge of `(P, C)`, in three levels:
   - **L0, consumer-side locality** (`resolve.ts`): the cursor, its next
     edges and the physical tail of `C.in`.
   - **L1, producer-side probes** (`locate.ts`, then `findEdgeInLockstep`):
     an empty `P.out`, its newest edge, a sole edge to another consumer,
     the four-link head start, then the outgoing hint, `tailIn` of the idle
     producer when it is an edge of exactly this pair (INV-H).
   - **L2, lockstep**: bounded by the shorter of `P.out` and `C.in`; the
     only general proof of absence. Its result refreshes the hint.
2. **Classify** it: in the prefix exactly when it carries the cursor's
   nonzero stamp (INV-T3), or always when the cursor is `lastIn` (INV-T2):
   `isEdgeInTrackedPrefix`.
3. **Reconcile**: duplicate, move the suffix edge after the cursor, or link
   a new edge: `reuseLocatedIncomingEdgeOrLink`, which never searches again.

`edge.stamp` is a pass-membership stamp, not a value version.

`tailIn` is one slot with two lifetime-disjoint readings (INV-H,
`../graph/hint.ts`): while the node is Computing, its tracking frontier;
otherwise null, the residual incoming edge, or a hint, one attached outgoing
edge (`from === node && to !== node`, so never a self-edge). The hint costs
no memory and closes the repeated pair: a broad producer re-read inside a
wide consumer (`items.map((i) => f(i, theme()))`) pays one lockstep per pass
instead of one per read. A hint is a positive answer only. It does not prove
absence, and a single slot per producer is overwritten when several wide
consumers interleave their lookups of the same producers; both cases stay at
the lockstep bound.

## Code map

| File                    | Role                                                                            |
| ----------------------- | ------------------------------------------------------------------------------- |
| `resolve.ts`            | hot path (next edge, cursor, first read) and the initial, tail and inner misses |
| `locate.ts`             | producer-side probes, then the graph lookup: one place for every miss kind      |
| `prefix.ts`             | prefix classification, shared with `push_iterator.ts`                           |
| `cleanup.ts`            | removal of the unvisited suffix after a successful pass                         |
| `../graph/findEdge.ts`  | exact pair lookup: head start, outgoing hint, lockstep                          |
| `../graph/hint.ts`      | INV-H: the two readings of `tailIn`                                             |
| `../graph/reuseEdge.ts` | reconciliation, eager suffix detachment, the default strategy                   |

Rules to keep when changing this code:

- **Eager suffix detachment (32 edges) is an identity policy, not a search
  bound.** It decides which edges survive and therefore subscriber order.
  Changing it is an observable change.
- **A configured `readTrackingStrategy` pays two lookups per call.** The
  resolver must locate the edge to reject duplicates before the call. This is
  the cost of the extension point; skipping the resolver lookup would hand
  duplicates to the strategy.
- **A hint never outlives its edge, and never sits in a frontier.** Every
  unlink path clears it (`unlinkEdge`, `unlinkDetachedIncomingEdgeSequence`,
  `unlinkAllSubscribers`), every computation resets `tailIn` to null before
  its first read, and the lookup writes one only into a node that is neither
  Computing nor a watcher. A new edge-removal path must clear it too; the
  oracle's tail invariant and the `hint-keep-on-unlink` mutant check this.

## JIT

Keep each tier's code where its frequency is. TurboFan charges a caller for a
callee's bytecode plus everything already inlined into the callee's optimized
code, against a fixed budget per compilation. A cold tier merged into a hot
function is inlined wherever the function is, and can push the hot read path
(`resolveTrackedRead`) out of `runWatcherCore`, `advanceCore` or
`executeComputation`. For that reason the tail miss and the inner miss are
separate functions: a call site inlines only the miss kind that occurs there.
The lookup is a plain loop and is not unrolled. Its four-link outgoing head
start (`OUTGOING_HEAD_START`) is a workload heuristic, not an invariant. The
hint is consulted only after it, so lookups that bounded fan-out settles
never read or write `tailIn`; the lockstep proper is a separate function
(`findEdgeInLockstepPastHeadStart`).

## Measuring

`scripts/compare-tracking-graph.mjs` snapshots the compiled internal
entrypoint with production flags and tree shaking, and alternates independent
Node processes for baseline and candidate (10,000 warmup passes, 20,000
measured passes, nine samples per variant). Each pass takes a fresh stamp from
the clock as a real pass does. Run from the repository root, saving the
baseline before editing the runtime:

```sh
pnpm --filter @volynets/reflex-runtime build:ts
node scripts/compare-tracking-graph.mjs --save baseline
# Apply the runtime changes, then rebuild.
pnpm --filter @volynets/reflex-runtime build:ts
node scripts/compare-tracking-graph.mjs --save candidate
node scripts/compare-tracking-graph.mjs baseline candidate
```

Results go to the ignored `temp/tracking-graph/` folder. `TRACKING_ONLY=<regex>`
selects scenarios; `TRACKING_ITERATIONS` and `TRACKING_WARMUP` shorten the
heavy wide × wide ones. Interpret timings alongside the unchanged
stable-tracking and generic-move controls.

`perf/tracking-pair-lookup/analyze.mjs` reports, per read that reaches the
lookup, `D = min(out(P), in(C))`, links compared and simulated slot hit rates
(PROFILE build; link counts, not timings).

Exactness is checked separately from timing. `scripts/fuzz-tracking-graph.mjs
--baseline <commit>` runs seeded scripts of passes, nested passes, unlinks and
disposals on production bundles of that commit and of the working tree,
compares every frontier and the whole graph (edge identity, stamps) after
every operation, and checks INV-H; `--qualify` requires every seeded mutant
of the hint and of the locate stage to be caught.

The repeated-pair case has its own scenarios, `hub-duplicates-16` and
`hub-duplicates-256` in `compare-tracking-graph.mjs`, and a permanent
workload in the paired benchmark suite, `A.track.hub-duplicate`.
