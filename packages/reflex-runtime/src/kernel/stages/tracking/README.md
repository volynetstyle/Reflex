# Read tracking

Code map for dependency tracking and the graph operations it uses. The rules
(INV-T, INV-H, INV-P, the lookup levels) are in
[INVARIANTS.md §5](../../../../docs/INVARIANTS.md#5-tracking); the reasoning and
measurements behind them are in [MODEL.md](../../../../docs/MODEL.md) §7.

## Files

| File                               | Role                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| `resolve.ts`                       | `resolveTrackedRead` (L0, the hot path) and the initial, tail and inner misses |
| `locate.ts`                        | producer-side probes (L1) in front of the graph lookup                         |
| `prefix.ts`                        | `isEdgeInTrackedPrefix` (INV-T2, INV-T3), shared with `push_iterator.ts`       |
| `cleanup.ts`                       | removal of the unread suffix                                                   |
| `read.ts`                          | `trackRead`, an entry for tests and tools                                      |
| `../../shape/graph/findEdge.ts`    | hint, two-link head start, lockstep, finger race                               |
| `../../shape/graph/hint.ts`        | recognizes a hint in `tailIn` (INV-H)                                          |
| `../../shape/graph/tape.ts`        | strikes, prepare, lease and absence certificate (INV-P)                        |
| `../../shape/graph/cursorMoves.ts` | the two tracking moves: a suffix edge to the head or right after the cursor    |
| `../../shape/graph/linkEdge.ts`    | link and unlink one pair; tracking-specialized links                           |
| `../../shape/graph/sweepEdges.ts`  | unlink a detached incoming sequence or every edge on one side of a node        |
| `../../shape/graph/reuseEdge.ts`   | the default `readTrackingStrategy`; the resolver never calls it                |
| `../../shape/graph/edgeList.ts`    | general incoming-list moves for tests, benchmarks and tools                    |

Names: `cursorEdge` is the last edge accepted in this pass (null: none yet);
`expectedNextEdge` is the first suffix edge; `insertAfterEdge` is where a
moved or new edge goes (null: the head). Functions ending in `Unchecked`
require the preconditions in their comments.

## Where code lives, and why

TurboFan inlines against a cumulative bytecode budget per compilation, so a
cold tier merged into a hot function is paid for wherever that function is
inlined, and can push `resolveTrackedRead` out of `advanceCore`,
`runWatcherCore` or `executeComputation`.

- The initial, tail and inner misses are separate functions: a call site
  inlines only the miss kind that happens there.
- A miss handler takes only the cursor and re-reads the stamp and the
  expected edge from it; the locality tiers of the inner miss share one move
  call; link and move helpers have no parameter defaults.
- Past the head start there are two loops, the plain lockstep
  (`findEdgeInLockstepPastHeadStart`) and the finger race
  (`findEdgeInLockstepFromFinger`), so a site that never meets a finger inlines
  only the first.
- The loops are plain: unrolled, split and `switch` shapes measured the same.
  Merging the misses into one never-inlined handler was measured and rejected
  (MODEL.md §7.2).

Changing this code: run the tracking fuzz and the stage gate
([GUIDE.md](../../../../docs/GUIDE.md#stage-and-tracking-tools)), then the
paired CI comparison.
