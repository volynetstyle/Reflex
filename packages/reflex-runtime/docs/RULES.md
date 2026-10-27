# Runtime rules with checked citations

Each row names a current rule and a source, executable check, and contract
citation. Citations use `path::literal text` from the package root. Run
`pnpm check:rules` after changing a cited file. The checker verifies that the
file and literal still exist; reviewers must verify the rule's meaning.

| ID  | Rule                                                                                                                                                                                                                                               | Source                                                                                                                                                                                                     | Check                                                                                                        | Contract                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| R1  | Validate the complete committed watcher frontier before lifecycle work.                                                                                                                                                                            | `src/kernel/stages/stabilization/pull_frontier.ts::for (let edge = firstEdge`                                                                                                                              | `test/projection/watcher-frontier.projection.test.ts::profiles the complete V3 watcher frontier`             | `docs/INVARIANTS.md::Pull descends through unknown dependencies`  |
| R2  | Reentrant invalidation during a watcher epoch retains and delivers a validation obligation; execution needs execution evidence.                                                                                                                    | `src/kernel/stages/stabilization/pull_frontier.ts::validation epoch` `src/kernel/stages/propagation/push_iterator.ts::markComputingSubscriber` `src/kernel/engine/watcher.ts::invalidatedDuringValidation` | `test/differential/runtime.reentrant-write.test.ts::retains the wake`                                        | `docs/INVARIANTS.md::Computing invalidation can also`             |
| R3  | A dependency membership epoch is not a producer value epoch; `edge.stamp` cannot prove value freshness.                                                                                                                                            | `src/kernel/stages/tracking/resolve.ts::const passStamp = cursorEdge.stamp`                                                                                                                                | `test/differential/runtime.tracking-stamp.test.ts::does not confuse a tracking stamp`                        | `docs/INVARIANTS.md::edge.stamp`                                  |
| R4  | Failed tracking may leave partial graph reconciliation and must retry safely.                                                                                                                                                                      | `src/kernel/shape/graph/reuseEdge.ts::reuseLocatedIncomingEdgeOrLink`                                                                                                                                      | `test/differential/runtime.next-experiments.test.ts::retries changed dependency layouts`                     | `docs/INVARIANTS.md::Throws do not undo links`                    |
| R5  | Writes commit immediately inside a batch; the outer exit delivers pending settlement once.                                                                                                                                                         | `src/kernel/batch.ts::leaveReactiveBatch`                                                                                                                                                                  | `test/differential/runtime.batch-boundary.test.ts::empty and equal-write batches`                            | `docs/INVARIANTS.md::Source writes use`                           |
| R6  | Scheduler ownership is independent of watcher freshness.                                                                                                                                                                                           | `src/kernel/engine/watcher.ts::claimWatcherSchedule`                                                                                                                                                       | `test/differential/runtime.batch-boundary.test.ts::deduplicates host queue work`                             | `docs/INVARIANTS.md::It is independent of freshness`              |
| R7  | Hot node fields are initialized in a stable order.                                                                                                                                                                                                 | `src/kernel/shape/node.ts::class ReactiveNode`                                                                                                                                                             | `test/runtime/topology/runtime.node-shape.test.ts::keeps each role's own fields stable`                      | `docs/PERFORMANCE_RULES.md::Every hot object must be created`     |
| R8  | Push marks direct and transitive subscribers while repeated writes keep the latest value visible.                                                                                                                                                  | `src/kernel/stages/propagation/push_iterator.ts::Phase 1:`                                                                                                                                                 | `test/differential/runtime.next-experiments.test.ts::direct and shared fan-out`                              | `docs/INVARIANTS.md::Push first handles immediate outgoing edges` |
| R9  | A watcher that ends a run or a stable validation with a retained obligation is delivered again unless the host owns it.                                                                                                                            | `src/kernel/engine/watcher.ts::function deliverRetainedValidation` `src/kernel/engine/watcher.ts::function retainAfterExecution`                                                                           | `test/oracle/oracle.invariants.test.ts::detects F15 in the baseline`                                         | `test/differential/docs/SEMANTIC_CONTRACT.md::L1 Delivery`        |
| R10 | One-level push records `Changed` into a watcher in its own run without delivering it; the run consumes that evidence.                                                                                                                              | `src/kernel/stages/propagation/push_iterator_once.ts::Scheduled and Computing are ownership certificates`                                                                                                  | `test/runtime/topology/runtime.scheduled-delivery.test.ts::does not redeliver a watcher through a side edge` | `docs/INVARIANTS.md::is the ownership certificate`                |
| R11 | An idle node's `tailIn` may be a lookup hint: an attached outgoing edge, never a self-edge, used as the answer for its own pair or as the centre of a bounded outgoing walk, cleared by every unlink and reset before the slot becomes a frontier. | `src/kernel/shape/graph/findEdge.ts::const hint = producer.tailIn` `src/kernel/shape/graph/sweepEdges.ts::if (from.tailIn === edge) from.tailIn = null;`                                                   | `test/runtime/topology/runtime.tracking-hint.test.ts::produces the same graphs and keeps INV-H`              | `docs/INVARIANTS.md::semantically inactive and is`                |

These checks guard current semantics while the generation, layout, notify epoch,
and settlement experiments remain independent implementation candidates.

## R2: why the committed-frontier wake is retained and delivered

Reentrant invalidation during watcher validation preserves a subsequent
validation obligation. Execution is required only when a direct change or a
confirmed dependency change provides execution evidence.

`pull_frontier` temporarily sets `Computing` and extends `tailIn` across the
watcher's complete committed frontier; the watcher callback does the same for
its active prefix. A nested producer write reaching one of those edges enters
`markComputingSubscriber`. A direct edge records `Visited | Unknown`: the
watcher read the written producer, so `Visited` is execution evidence and
`pull_frontier` converts it to `Changed` on entry to the next pass. A
transitive edge records `Revalidate | Unknown` instead: a computed between the
write and the watcher may still recompute to an equal value, so the next pass
validates and equality cutoff decides. `Revalidate` on entry is discharged by
that pass; only an invalidation recorded during the pass requests another.

Retaining the obligation is not enough. While the watcher keeps `Unknown`,
later pushes merge into it without emitting, so `runWatcherCore` emits
`onNodeInvalidated` itself on both exits that retain `Unknown` (stable skip
after validation, and completion after execution) unless the host already owns
`Scheduled`. Lifecycle errors keep `Unknown` whenever a dependency is still
dirty, because an idle watcher behind a dirty computed is unreachable by push.

Convergence: `Revalidate` alone never runs the callback, so a feedback write
that leaves every observed computed equal terminates after one extra
validation. A callback that produces an unbounded sequence of distinct observed
values is a program-level cycle; the runtime does not detect it.

This proof does not cover an arbitrary host callback that violates the
scheduler protocol.
