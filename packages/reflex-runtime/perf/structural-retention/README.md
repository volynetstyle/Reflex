# Structural retention: edge identity versus causal authority

Research branch `research/tracking-retained-identity`, 25 October 2026, base
`c2569dc` (preserve-until-cleanup, PR #67). Nothing here is a production
candidate. The analysis variants live in `variants.mjs` and are applied to an
archived copy of the sources; the checked-out runtime is unchanged.

## The arc

1. **Eager detach → preserve until cleanup (PR #67, merged).** Unlinking the
   unvisited suffix during a pass destroyed identities that the same pass then
   rebuilt (65–128 new edges per pass on mid and front insertions, 17–25×
   slower). Cleanup is now the only owner of removing stale dependencies.
2. **Cross-epoch retention, measured.** After cleanup a dependency no longer
   exists semantically. In `D.list.filter-select` all 6,533 dropped pairs that
   came back did so at the consumer's next execution, with zero writes to the
   producer in between (`perf/evidence-flow` profiler, dead-interval
   accounting). In the adversarial oracle corpus only 118 of 796 dropped
   pairs came back at the next execution.
3. **The identity/authority split.** Keeping the edge with full authority for
   one epoch (design a) wins only when nothing is written in the gap. One
   write turns the win into a loss. An edge carries two functions, structural
   identity and propagation authority, and their optimal lifetimes differ.

The question this branch studies:

> How can edge identity survive one inactive epoch without retaining
> propagation authority?

## Designs

**(a) `retain-one-epoch`: full authority, the upper bound of causal cost.**
Cleanup keeps a suffix edge the previous pass read and marks it (stamp 0); a
marked edge is unlinked at the next cleanup. The edge stays in both lists, so
propagation marks through it and validation walks it. It breaks the oracle's
exact-dependency invariant by design.

**(b) `retain-identity`: identity outside the causal adjacency.**

- **While idle the edge is in neither list.** Cleanup takes every unread suffix
  edge out of the producer's outgoing list and the consumer's incoming list,
  exactly as before, so no propagation and no validation can see it while the
  consumer is idle.
- **Retention costs no new field.** An edge the previous pass read is marked
  retained (stamp −1; the stamp clock only grows from 0, so −1 is never a pass
  stamp) and chained through its own free `nextIn`. The chain head goes to the
  consumer's idle `tailIn`, a third lifetime-disjoint reading next to the
  residual edge and the outgoing hint (INV-H). Readings are told apart by
  direction and stamp; a hint fill overwrites the head and the chain is simply
  dropped.
- **Re-attach at the next computation.** Where the computation clears `tailIn`,
  the chain is appended to the end of both lists as an ordinary unvisited
  suffix. Since PR #67 such a suffix is causally inert during the pass, so
  tracking reuses a reread edge through its existing paths. The push and
  tracking hot paths are unchanged. Watcher validation runs before the
  computation and never sees retained edges.
- **Lifetime is one epoch.** An edge retained once and not read again is
  dropped at the next cleanup.
- **A throw drops the unread retained edges.** A computation that throws
  skips cleanup, so its catch drops the retained edges the failed pass did not
  read. Without this a failed pass left them attached with authority: 68
  semantic divergences out of 40,000 before the fix.

## Semantics

`differential.mjs --base HEAD --candidate HEAD+retain-identity`, 40,000
programs (oracle, hub and targeted wide consumers), invariant checks on both
sides: 39,998 byte-identical traces, including adjacency order. The two
others:

- **Stack overflow:** seed 15507 overflows at a different depth.
- **Nested self-recompute:** in seed 8688 a host hook re-reads the node during
  its own computation, outside the contract (a cycle in development builds),
  and the baseline already violates an invariant there. The inner cleanup
  writes the chain head into the slot the outer pass uses as its frontier. A
  production version must not rely on computations of one node never nesting.

Design (a) diverges semantically in thousands of programs: its retained edges
are real dependencies.

The oracle's INV-H check accepts the retained head as a third idle reading on
this branch only (`test/oracle/program.ts`, `checkTail`).

## Cost boundary

`sweep.mjs`: per row a consumer reads `tick`, `show` and, while `show = 1`,
its own `item`. Each cycle drops `item` for `gap` consumer executions and
writes it `w` times meanwhile. 64 rows, 7 samples, one process per (sample,
cell, policy), Node 25.2. The report is
`bench-results/structural-retention/sweep-002.json`. Ratios are policy time
over cleanup time, median (range):

| consumer | gap |    w | (a) full authority | (b) identity only | extra executions (a) / (b) |
| -------- | --: | ---: | -----------------: | ----------------: | -------------------------- |
| computed |   1 |    0 |   0.64 (0.60–0.70) |  0.79 (0.73–0.86) | 0 / 0                      |
| computed |   1 | 1–16 |          1.07–1.35 |         0.82–0.95 | 1 / 0                      |
| computed |   2 |    0 |               1.15 |              1.32 | 0 / 0                      |
| computed |  ≥2 |   ≥1 |          1.05–1.21 |         1.11–1.32 | 1 / 0                      |
| watcher  |   1 |    0 |   0.72 (0.68–0.76) |  0.88 (0.81–0.98) | 0 / 0                      |
| watcher  |   1 | 1–16 |          1.09–1.32 |         0.83–0.95 | 1 / 0                      |
| watcher  |  ≥2 |  any |          1.01–1.27 |         1.07–1.26 | 0–1 / 0                    |

- **(b) keeps the gap-1 saving under writes, where (a) pays an observable run.**
  At gap 1 with writes, (b) keeps identity (0 links, 0 unlinks) and adds no
  execution. For a watcher, (a)'s extra execution is an observable extra run.
- **(b) saves less than (a) at gap 1 with no writes.** It still unlinks the
  outgoing side at cleanup and re-attaches both sides at the next computation;
  (a) touches nothing.
- **(b) loses more than (a) when the dependency does not come back next
  epoch.** The re-attach and the second drop are spent for nothing, and every
  computation start pays one load and compare of the slot.

Per dropped dependency, with `p₁` the probability that it is read again at
the consumer's next computation, retaining identity pays when

p₁ · (L + k) > r + c + (1 − p₁) · u

- `L`: the absence proof before relinking, which the reuse skips;
- `k`: allocating and linking a new edge;
- `r`: re-attaching to both lists;
- `c`: chaining at cleanup;
- `u`: the second drop.

The sweep's graph keeps `L` tiny (min(out, in) is 1–3). In wide consumers
`L` is a lockstep absence proof (more than 100 links on the tracking ladder),
which moves the boundary towards retention. Measured `p₁`:
`D.list.filter-select` 6,533 / 6,600 ≈ 0.99, oracle corpus 118 / 796 ≈ 0.15.

## Open before any production candidate

- **Nested self-recompute.** Detect it, or give up on the idle-slot reading.
- **Memory.** A consumer that never computes again keeps its last dropped
  producers reachable until it is disposed (compare
  `E.retention.subtree-churn`).
- **Slot check cost.** The computation-start check runs even when nothing is
  retained; it needs the paired CI gate, not a microworkload.
- **Prediction of `p₁`.** Without a causal signal, retaining by history is a
  heuristic. The sweep shows a single policy cannot win both the `D.list`
  shape and the oracle shape.
- **Diagnostics.** INV-H documentation, `debug.graph.ts` and the graph
  inspector assume an idle `tailIn` is incoming or a hint.

## Reproduce

```sh
node perf/structural-retention/differential.mjs --base HEAD --candidate HEAD+retain-identity
node perf/structural-retention/sweep.mjs --ref HEAD --rows 64 --samples 7 --out <report.json>
```
