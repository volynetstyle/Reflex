# Next Reflex experiments

This is a queue of independent checks, not a list of changes to merge into
the runtime right away. For performance variants, the baseline and a profile
of the specific region are recorded first; then one mechanism is changed in an
isolated variant. The comparison covers identical semantic work, the time
distribution (mean, p95, p99), allocations, and repeated runs in fresh
processes.

## 1. Nested validated dependency write

**Question.** Does a watcher lose a rerun when a nested computation during
`pull_frontier()` writes into an already validated dependency of the same
watcher?

**Check.** Build a watcher with an early and a late committed dependency.
While the late dependency is validated, a nested callback writes into the
early one. Swap the dependencies; check `Changed`, `Unknown`, `Visited`, the
state of the scheduler claim, the number of runs and the final value. Repeat
with an exception after the write and with several nested writes. Compare the
public behavior with an independent model, and the internal state with the
current topology contracts.

**Entry point.** `test/runtime/topology/runtime.watcher-validation.test.ts`,
`src/kernel/stages/stabilization/pull_frontier.ts`. The existing test already
covers a write into a committed edge during validation; the new scenario must
check specifically an _already validated_ edge and an observable rerun.

**Decision.** If the run is lost, first keep the reproducing test, then fix
the reentrant invalidation protocol. If the test passes, record the invariant
and leave the hot path alone.

## 2. Generation as universal validation witness

**Question.** Can a generation prove that a dependency is current and replace
part of the reconciliation checks without changing order or retry semantics?

**Check.** First list exactly which truth each stamp proves. `edge.version` is
currently a tracking-pass stamp, not a revision of the producer's value.
Investigate the proof of value freshness and of membership separately; run
static, branch switch, reorder, duplicate read, nested tracking,
exception/retry and epoch wraparound. Count walks, branches and bytes/node.

**Entry point.** `src/kernel/shape/tracking/`,
`src/kernel/shape/graph/reuseEdge.ts`, `src/kernel/state.ts`.

**Decision.** Accept an extension only with an invariant proven for all the
listed transitions and a gain on an isolated workload. A shared stamp that
mixes membership and value freshness does not count as proof.

## 3. Node hot/cold split

**Question.** Which `ReactiveNode` fields do producers, consumers and watchers
actually need on the hot path, and would splitting them reduce memory and
creation cost without unstable property-access sites?

**Check.** Record baseline bytes/node (with the graph retained and after GC),
creation, write, pull, watcher run and p99. Profile IC/deopt separately for
uniform and mixed roles. Compare the current full shape with one narrow
alternative layout, keeping the same field initialization order within each
shape.

**Entry point.** `src/kernel/shape/node.ts` and
`test/dev/runtime/runtime.memory.dev.test.ts`.

**Decision.** Keep a split only if the memory/creation gain is confirmed and
mixed-role accesses do not hurt update and propagation. Do not mix this
experiment with state-machine changes.

## 4. Notify epoch / repeated staged writes

**Question.** How much repeated work does push do for several changed writes
inside one batch when the receivers are already invalidated?

**Check.** A matrix: one producer with repeated writes, independent producers
with shared descendants, direct watcher fan-out, various widths and depths.
Count visits over direct/transitive edges, host hook calls, scheduler claims
and the final number of watcher runs. Compare with the same order and number
of writes, including interleaved reads and reentrant writes.

**Entry point.** `src/kernel/stages/propagation/push_iterator.ts`,
`src/kernel/batch.ts`, the existing topology perf fixtures.

**Decision.** An epoch is acceptable only if it removes proven repeated work,
does not hide a new write after a read, and does not change the immediate
invalidation contract.

## 5. `settleFast()`

**Question.** What share of the cost of a simple batch comes from the general
runtime and host settlement checks?

**Check.** Isolate an empty batch, an equal write + batch/flush, a changed
write without subscribers, and one watcher. Measure the runtime boundary, the
scheduler queue and the DOM coordinator separately; compare paired trials with
equal work counters. The reference point already recorded is about 4 ns for
the same-write boundary gap, but that alone does not prove that a separate
fast path pays off.

**Entry point.** `src/kernel/batch.ts`,
`packages/reflex-dom/bench/scheduler-boundary.bench.ts`,
`bench-results/reflex-competitors/PRIORITY_FINDINGS.md` (paths from the
repository root).

**Decision.** Keep a specialization only with a stable absolute gain above
noise, no p99 regression, and no bypass of host-visible settlement semantics.

## 6. `RULES.md` and a generated citation checker

This is a separate correctness task. Create a short index of the rules in
force: rule ID, statement, source code, test and detailed document. A
generator checks that the cited file paths, anchors and test names exist; CI
runs the checker. The rule text remains a subject of review: the checker
confirms the references, not the semantic truth of the rule.

Start with the rules on reentrant validation, the committed frontier, the
tracking stamp, partial reconciliation on throw, scheduler ownership and the
runtime/host boundary. Reference documents: `docs/INVARIANTS.md`,
`docs/RUNTIME.md`, `docs/architecture-contract.md` and the
topology/differential tests.

## Order

1. The correctness scenario of item 1.
2. `RULES.md` and the checker: they pin the invariants before optimizations.
3. The measurement probes of items 4 and 5; change code only on a repeated
   gain.
4. Items 3 and 2 after a memory/IC profile and a formal analysis of stamp
   semantics.

Keep items 2-5 as separate variants: changing node layout, stamp, push epoch
and settle path at once would make it impossible to attribute a result to one
mechanism.

## Verified baseline (2026-09-30)

| Direction              | Observation                                                                                                                                                                                                                                                                                                                                                          | Decision status                                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Nested validated write | A separate output oracle passed for a write into an early/late committed edge, two consecutive nested writes, and an exception after the write.                                                                                                                                                                                                                      | A missed wake was not reproduced in these scenarios; the tests are kept as a regression gate.                                         |
| Generation             | Permutations, repeated reads, branch replacement and retry matched the independent SpecMachine. When the producer's value changed, `edge.version` stayed the same until a new tracking pass; the `0xffffffff → 1` transition was checked.                                                                                                                            | The current tracking stamp cannot be a universal witness of value freshness. An alternative generation scheme has not been tried yet. |
| Node hot/cold split    | Mixed-role differential cases passed at widths 1, 2, 8 and 32; the shape contract confirmed a stable field set for each role before and after execution. The existing callback-memory workload with 10,000 nodes gave 193 B/node for consumers and 192 B/node for watchers with `no-item-capture`; the figure includes the graph, the callback and retained objects. | A semantic baseline exists; the cost of a separate layout and IC stability have not been measured; no decision on a split.            |
| Repeated staged writes | Projection at widths 8 and 32: three changed writes visited `3 × width` direct edges and `width` transitive edges and produced `width` watcher notifications. A read between the writes reopened the transitive work.                                                                                                                                                | Repeated direct fan-out work is confirmed; an epoch variant must preserve the interleaved-read case.                                  |
| Settlement boundary    | An independent trace checked an empty/equal batch, the immediate commit, one host delivery and one settlement. A one-off DOM benchmark of the current branch: empty eager ~1.80 M ops/s, empty flush ~1.82 M ops/s, one eager watcher update ~0.44 M ops/s.                                                                                                          | This is a baseline without a paired candidate; the absolute gain of `settleFast()` is not established.                                |
| Rules citations        | `pnpm check:rules` checked 8 rules and 24 citations; the run was added to CI.                                                                                                                                                                                                                                                                                        | The checker is ready; the meaning of a rule is still checked in review.                                                               |

Checks: `pnpm test` (49 files, 298 passed, 1 skipped), `pnpm test:projection`
(6 files, 13 passed), `pnpm check:rules`, `pnpm typecheck`, `pnpm test:dev`
(7 files, 32 passed). `pnpm lint` still fails on 34 existing errors in the
generated `perf/*/results/*.mjs` and `test/differential/bounded-exhaustive.ts`;
the new files pass targeted ESLint.

Memory: from `packages/reflex-runtime`, `pnpm build:perf`, then
`node --expose-gc perf/callback-memory/run.mjs --count=10000 --trials=5 --variant=no-item-capture --json`.
DOM boundary: from `packages/reflex-dom`,
`pnpm exec vitest bench --config vite.config.ts bench/scheduler-boundary.bench.ts --run`.

## P0–P3: follow-up (2026-09-30)

### P0 — repeated direct fan-out

`writeProducer → pushIteratorCore`, direct phase, is the named traversal. The
projection baseline records `writes × width` direct edge visits while downstream
work is already coalesced to `width`. The new reopen matrix covers no
intervention, source/direct/transitive reads, new link, unlink, relink, watcher
execution, nested batch, and watcher failure. Pulling a direct or transitive
consumer, relinking a dependency, or executing a watcher can make a second
walk necessary. An especially small counterexample to a source-only marker is
`write → watcher callback throws before read → write`: recovery clears the
watcher's dirty state but retains its old edge, without a read on that source.

A safe skip witness would have to mean **every currently linked direct
subscriber is still invalidated by this source's last walk**. It must be
invalidated on new linking and on any retained subscriber becoming clean,
including error recovery. Current source/batch state does not encode that
predicate. Maintaining it through every clean/relink path would add graph
visits or mutations to common read paths. No hot-path patch is accepted on the
present evidence. A future candidate needs an isolated implementation, a
profile showing the direct phase dominates a real wide-write workload, and
paired mean/p95/p99 measurements against the reopen matrix.

### P1 — nested validation proof

`RULES.md` R2 now states the mechanism and its scope. The watcher validation
frontier is marked `Computing`; a nested write through a committed edge sets
`Visited | Unknown` even if the watcher was already `Unknown`. The marker
survives frontier restoration, so a later watcher run executes. The independent
output oracle covers early/late edge order, repeated writes, throw/retry, and
generated write/failure combinations. This proof is scoped to the committed
watcher frontier, rather than arbitrary uncommitted edges or host callbacks.

### P2 — retained allocation

`perf/node-allocation/README.md` gives the reproducible fixture and medians.
With shared callbacks, producers, consumers, and watchers each retain about
97 B/node. A distinct captured closure adds about 96 B/node; attached edges
add about 80–82 B/edge. Shared cleanup and the scheduled state bit add no
resolved allocation. Owner metadata is outside this low-level runtime fixture.
The evidence does not justify a node hot/cold split.

### P3 — differential state space

The differential operation language now has explicit nested batch boundaries.
A seeded fast-check suite executes 1000 generated traces of writes, pulls,
branch changes, watcher failure, flush, nested batches, and watcher
dispose/recreate against `SpecMachine`. It also runs causal prefixes for
`write → pull → write`, `write → link → write`, `write → unlink → write`, and
failure/recreation. A second generated suite uses an independent output oracle
for nested writes during validation, with an optional throw after the write.
The spec observes explicit reads and flushes; batch entries/exits themselves
have no value event in that oracle.

## Addendum (2026-10-16)

Item 1 and the P1 proof covered writes through a committed edge read
directly by the watcher. A transitive variant (a write reaching the watcher
only through a computed, during validation or execution) did lose delivery:
F15 in [SEMANTIC_CHARACTERIZATION.md](../characterization/SEMANTIC_CHARACTERIZATION.md),
fixed by the `Revalidate` obligation and stated as contract rules L1-L5 in
[SEMANTIC_CONTRACT.md](../../test/differential/docs/SEMANTIC_CONTRACT.md).
