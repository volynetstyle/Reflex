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
   exists semantically. In `D.list.filter-select`, all 6,533 dropped pairs
   that came back did so at the consumer's next execution, with no write to
   the producer in between (`perf/evidence-flow`, dead-interval accounting).
   In the adversarial oracle corpus only 118 of 796 dropped pairs came back
   at the next execution.
3. **The identity/authority split (design a vs b).** Keeping the edge with full
   authority for one epoch wins only when nothing is written in the gap; one
   write turns the win into a loss. Identity without authority keeps the win
   under writes. The two functions an edge carries, structural identity and
   propagation authority, have different optimal lifetimes.
4. **Materialize identity on demand (design c).** Design (b) restored every
   retained edge eagerly at the next computation, before knowing whether it
   would be read, and lost 7–32% when it was not: eager detach in reverse.
   Lazy reactivation removes that speculative work.

The principle the arc keeps confirming:

> Do not mutate graph structure until semantics demands the mutation.

## Designs

**(a) `retain-one-epoch`: full authority, the upper bound of causal cost.**
Cleanup keeps a suffix edge the previous pass read and marks it (stamp 0); a
marked edge is unlinked at the next cleanup. The edge stays in both lists, so
propagation marks through it and validation walks it. It breaks the oracle's
exact-dependency invariant by design.

**(b) `retain-identity`: eager reattachment, feasibility proof.**

- **While idle the edge is in neither list.** Cleanup takes it out of both,
  as before.
- **Retention reuses existing fields.** An edge the previous pass read is
  marked (stamp −1), chained through its free `nextIn`, and the head sits in
  the consumer's idle `tailIn`.
- **Eager reattachment.** At the next computation the whole chain is appended
  to both lists as an inert unvisited suffix.
- **Hazard:** a throwing computation must drop what it did not read. Using
  `tailIn` for a third idle meaning is fragile: a nested same-node
  computation (seed 8688) leaves the outer pass with a detached frontier.

**(c) `lazy-identity`: lazy reactivation.**

- **Retained edges live in a dedicated cold field.** A node field,
  `retainedIn`, holds the edges the last cleanup took out of both lists, in
  their old read order, chained through `nextIn`.
- **Nothing is restored at the next computation.** A read that misses the
  active edges in a cold path (initial, tail or cursor miss) first compares
  the chain head with its producer. On a match it splices that edge in at the
  cursor and at the end of the producer's outgoing list, with no lookup and no
  allocation. Hot paths are unchanged.
- **No duplicate pair without a lookup.** Any cold-path link of a new edge
  abandons the chain, so a chained producer never also has an active edge.
  The hot first-edge link is safe because a chain is kept only while the
  incoming list is nonempty: cleanup, `unlinkEdge`, `unlinkAllSubscribers` and
  `unlinkAllSources` clear it otherwise.
- **Expiry costs no list work.** The next cleanup replaces the chain, and dispose
  clears it.
- **Variants of (c):**
  - `lazy-identity-strict` expires the chain at the end of every computation
    (one store on the exit path), so identity outlives membership by exactly
    one consumer epoch.
  - `lazy-identity-neutral` retains a dropped edge only when its producer
    keeps another subscriber after the unlink. Retention then never extends a
    node's lifetime; it costs the edge object alone.

## Semantics

`differential.mjs --base HEAD --candidate HEAD+<variant>`, 40,000 programs
(oracle, hub, and targeted wide consumers), invariant checks on both sides.

| variant                   |               identical traces | other                                                                |
| ------------------------- | -----------------------------: | -------------------------------------------------------------------- |
| (a) retain-one-epoch      | 5,236 of 8,000 (a smaller run) | 2,763 semantic divergences: its retained edges are real dependencies |
| (b) retain-identity       |                         39,998 | a stack-overflow depth; the nested self-recompute (8688)             |
| (c) lazy-identity         |                     **40,000** | none                                                                 |
| (c) lazy-identity-strict  |                     **40,000** | none                                                                 |
| (c) lazy-identity-neutral |                     **40,000** | none                                                                 |

The identical count is not vacuous: in 20,000 oracle programs
`lazy-identity` reactivates 1,155 of 5,182 retained edges, in 840 programs.
The dedicated field removes the nesting hazard, and nothing is attached while
a throwing pass runs, so (c) needs no drop-on-throw.

The oracle's INV-H check accepts (b)'s retained head as a third idle reading
on this branch only (`test/oracle/program.ts`, `checkTail`).

## Cost

`sweep.mjs`: per row a consumer reads `tick`, `show` and, while `show = 1`,
its own `item` (which has another subscriber). Each cycle drops `item` for
`gap` consumer executions and writes it `w` times meanwhile. 64 rows,
7 samples, one process per (sample, cell, policy), Node 25.2. Report:
`bench-results/structural-retention/sweep-003.json`. Ratios are policy time
over cleanup time; the ranges span the medians over `w` (and over both
consumer kinds):

| policy             | gap 1                                | gap 2         | gap 4         | never     |
| ------------------ | ------------------------------------ | ------------- | ------------- | --------- |
| (a) full authority | 0.64–0.68 (w = 0); 1.04–1.31 (w ≥ 1) | 0.98–1.29     | 1.03–1.22     | 1.01–1.20 |
| (b) eager reattach | 0.82–0.95                            | 1.02–1.32     | 1.10–1.28     | 1.09–1.24 |
| **(c) lazy**       | **0.77–0.93**                        | **0.80–0.95** | **0.88–0.95** | 0.95–1.09 |
| (c) strict         | 0.76–0.94                            | 0.96–1.09     | 0.96–1.07     | 0.96–1.09 |

- **(c) keeps (b)'s gap-1 gain under writes** (0 links, 0 extra executions).
- **The negative branch is gone.** A dependency that never comes back costs
  about what cleanup costs, within noise. Strict (c) is neutral beyond gap 1.
- **Plain (c) also reuses after longer gaps.** In this workload the tick
  epochs run no cleanup, so the chain survives until the dependency comes
  back. Its horizon is "until the consumer drops something else", not a
  fixed number of epochs.
- **(a) still wins most at gap 1 without writes,** because it touches nothing.
  (c) still unlinks the outgoing side at cleanup and splices on reactivation.

On the real workload `D.list.filter-select` (bench/workloads.mjs, 7 samples,
`bench-results/structural-retention/dlist-001.json`):

| policy      | links per step | reactivations per step | time per step / cleanup |
| ----------- | -------------: | ---------------------: | ----------------------- |
| cleanup     |           33.4 |                      0 | 1                       |
| (c) lazy    |            4.2 |                   29.2 | 0.93 (0.88–0.98)        |
| (c) neutral |            4.2 |                   29.2 | 0.92 (0.83–0.97)        |
| (c) strict  |            4.2 |                   29.2 | 0.91 (0.88–0.96)        |

The whole step (writes, recomputes, watcher runs) is 7–9% faster.

### Memory

`memory.mjs`, one `--expose-gc` process per run, median of 3
(`bench-results/structural-retention/memory-001.txt`):

| policy              | bytes per producer + computed pair | bytes per dormant consumer | dropped producers alive | churn bytes per cycle |
| ------------------- | ---------------------------------: | -------------------------: | ----------------------: | --------------------: |
| cleanup             |                              368.8 |                     10,847 |                      0% |                    61 |
| (b) retain-identity |                              368.9 |                     20,770 |                    100% |                    62 |
| (c) lazy            |                              384.8 |                     20,905 |                    100% |                    62 |
| (c) strict          |                              384.9 |                     20,905 |                    100% |                    62 |
| (c) neutral         |                              384.8 |                 **10,921** |                  **0%** |                    63 |

- **"Dormant" setup.** 2,000 live computeds each drop 8 producers with a
  1 KiB payload and never compute again.
- **"One epoch" means one consumer epoch, not wall time.** A consumer that
  never computes again keeps its retained producers as long as it lives, and
  strict expiry does not help.
- **The lifetime-neutral rule removes that cost.** It retains only edges whose
  producer stays reachable through another subscriber; the rest is the field
  (+8 bytes per node).
- **Disposal releases everything.** The churn workload
  (`E.retention.subtree-churn`) is unchanged under every policy.

## Boundary

Per dropped dependency, with `p₁` the probability that it is read again
before it expires, retention pays when

p₁ · (L + k) > c_retain + (1 − p₁) · c_expire

- `L`: the absence proof that a cold-path reactivation skips;
- `k`: allocating and linking a new edge;
- `c_retain`: chaining at cleanup.

For (b), `c_expire` included reattaching and dropping again. For (c) it is
zero: an expired edge is forgotten. The bound therefore becomes

p₁ > c_retain / (L + k)

with a small numerator. The lower `L + k`, the higher the `p₁` needed:
narrow graphs need frequent resurrection, while wide consumers, where `L` is
a lockstep absence proof, need little. The microworkload's `never` cells put
the residual cost at about 2–4%: chaining, the field, the abandon store on
links, and the head check on miss paths.

## Open

- **Out-of-order resurrection.** Only the chain head is checked (an O(1)
  locality tier), and any new link abandons the chain. A consumer whose next
  pass first links something new loses its chain. Whether a bounded search
  would pay is not measured.
- **Horizon.** Plain (c) keeps a chain until the next cleanup; strict (c) for
  exactly one epoch. Both are measured; neither is chosen.
- **Field cost.** +8 bytes per node, and the cold-path checks; a production
  candidate needs the paired CI gate and the shape check.
- **`p₁` prediction.** Deferred until the mechanism above is settled, as
  intended.

## Reproduce

```sh
node perf/structural-retention/differential.mjs --base HEAD --candidate HEAD+lazy-identity-neutral
node perf/structural-retention/sweep.mjs --ref HEAD --samples 7 --out <report.json>
node perf/structural-retention/sweep.mjs --ref HEAD --policies lazy,neutral,strict --no-synthetic --bench D.list.filter-select --out <report.json>
node perf/structural-retention/memory.mjs --ref HEAD --policies identity,lazy,strict,neutral
```
