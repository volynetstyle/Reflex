# Read tracking

How a tracking pass turns the reads of a computation into the consumer's
incoming edge list. The full description, with invariants and their proofs,
the lookup bound, prior art, measurements and the slot decision, is in
[RESEARCH.md](./RESEARCH.md). This file is the working summary.

## Model

The cursor `consumer.tailIn` splits the incoming list into the prefix
accepted in this pass and the suffix of older dependencies. A read off the
sequential path is resolved in three steps:

1. **Locate** the edge of `(P, C)`: `findEdgeInLockstep`, bounded by the
   shorter of `P.out` and `C.in`.
2. **Classify** it: in the prefix exactly when it carries the cursor's
   nonzero stamp (INV-T3), or always when the cursor is `lastIn` (INV-T2):
   `isEdgeInTrackedPrefix`.
3. **Reconcile**: duplicate, move the suffix edge after the cursor, or link
   a new edge: `reuseLocatedIncomingEdgeOrLink`, which never searches again.

`edge.stamp` is a pass-membership stamp, not a value version.

## Code map

| File                             | Role                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------- |
| `resolve.ts`                     | hot path (next edge, cursor, first read) and the initial, tail and inner misses |
| `prefix.ts`                      | prefix classification, shared with `push_iterator.ts`                           |
| `cleanup.ts`                     | removal of the unvisited suffix after a successful pass                         |
| `../../shape/graph/findEdge.ts`  | exact pair lookup                                                               |
| `../../shape/graph/reuseEdge.ts` | reconciliation, eager suffix detachment, the default strategy                   |

Two rules to keep when changing this code:

- **Eager suffix detachment (32 edges) is an identity policy, not a search
  bound.** It decides which edges survive and therefore subscriber order.
  Changing it is an observable change.
- **A configured `readTrackingStrategy` pays two lookups per call.** The
  resolver must locate the edge to reject duplicates before the call. This is
  the cost of the extension point; skipping the resolver lookup would hand
  duplicates to the strategy.

## JIT

Keep each tier's code where its frequency is. TurboFan charges a caller for a
callee's bytecode plus everything already inlined into the callee's optimized
code, against a fixed budget per compilation. A cold tier merged into a hot
function is inlined wherever the function is, and can push the hot read path
(`resolveTrackedRead`) out of `runWatcherCore`, `advanceCore` or
`executeComputation`. For that reason the tail miss and the inner miss are
separate functions: a call site inlines only the miss kind that occurs there.
The lookup is a plain loop and is not unrolled. Its four-link outgoing head
start (`OUTGOING_HEAD_START`) is a workload heuristic, not an invariant.

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
