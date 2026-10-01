# Runtime rules with checked citations

Each row names a current rule and a source, executable check, and contract
citation. Citations use `path::literal text` from the package root. Run
`pnpm check:rules` after changing a cited file. The checker verifies that the
file and literal still exist; reviewers must verify the rule's meaning.

| ID  | Rule                                                                                                          | Source                                                                                                                                                                                        | Check                                                                                            | Contract                                                          |
| --- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| R1  | Validate the complete committed watcher frontier before lifecycle work.                                       | `src/kernel/stages/second/pull_frontier.ts::for (let edge = firstEdge`                                                                                                                        | `test/projection/watcher-frontier.projection.test.ts::profiles the complete V3 watcher frontier` | `docs/INVARIANTS.md::Pull descends through unknown dependencies`  |
| R2  | A nested write through a committed watcher dependency during validation retains a later execution obligation. | `src/kernel/stages/second/pull_frontier.ts::validation epoch` `src/kernel/stages/first/push_iterator.ts::markComputingSubscriber` `src/kernel/engine/watcher.ts::invalidatedDuringValidation` | `test/differential/runtime.reentrant-write.test.ts::retains the wake`                            | `docs/INVARIANTS.md::Computing invalidation can also`             |
| R3  | A dependency membership epoch is not a producer value epoch; `edge.version` cannot prove value freshness.     | `src/kernel/shape/tracking/read.ts::consumer.tailIn?.version ?? trackingEpoch`                                                                                                                | `test/differential/runtime.tracking-stamp.test.ts::does not confuse a tracking stamp`            | `docs/INVARIANTS.md::edge.version`                                |
| R4  | Failed tracking may leave partial graph reconciliation and must retry safely.                                 | `src/kernel/shape/graph/reuseEdge.ts::reconcileIncomingSuffix`                                                                                                                                | `test/differential/runtime.next-experiments.test.ts::retries changed dependency layouts`         | `docs/INVARIANTS.md::Throws do not undo links`                    |
| R5  | Writes commit immediately inside a batch; the outer exit delivers pending settlement once.                    | `src/kernel/batch.ts::leaveReactiveBatch`                                                                                                                                                     | `test/differential/runtime.batch-boundary.test.ts::empty and equal-write batches`                | `docs/INVARIANTS.md::Source writes use`                           |
| R6  | Scheduler ownership is independent of watcher freshness.                                                      | `src/kernel/engine/watcher.ts::claimWatcherSchedule`                                                                                                                                          | `test/differential/runtime.batch-boundary.test.ts::deduplicates host queue work`                 | `docs/INVARIANTS.md::It is independent of freshness`              |
| R7  | Hot node fields are initialized in a stable order.                                                            | `src/kernel/shape/node.ts::class ReactiveNode`                                                                                                                                                | `test/runtime/topology/runtime.node-shape.test.ts::keeps each role's own fields stable`          | `docs/AGENTS.md::Every hot object must be created`                |
| R8  | Push marks direct and transitive subscribers while repeated writes keep the latest value visible.             | `src/kernel/stages/first/push_iterator.ts::Phase 1:`                                                                                                                                          | `test/differential/runtime.next-experiments.test.ts::direct and shared fan-out`                  | `docs/INVARIANTS.md::Push first handles immediate outgoing edges` |

These checks guard current semantics while the generation, layout, notify epoch,
and settlement experiments remain independent implementation candidates.

## R2: why the committed-frontier wake is retained

`pull_frontier` temporarily sets `Computing` and extends `tailIn` across the
watcher's complete committed frontier; it also makes `Visited` available as the
current validation pass's invalidation marker. A nested producer write reaching
one of those edges enters `markComputingSubscriber`, which records
`Visited | Unknown` even when `Unknown` was already set. `pull_frontier` restores
the cursor and clears `Computing`, but preserves that marker; `runWatcherCore`
therefore retains `Unknown` and the next run treats `Visited` as an execution
obligation. A dedicated missed-wake latch is unnecessary for this committed
watcher-frontier case. This proof does not cover a new uncommitted edge or an
arbitrary host callback that violates the scheduler protocol.
