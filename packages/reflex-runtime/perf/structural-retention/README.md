# Structural retention: edge identity versus causal authority

Research branch `research/tracking-retained-identity`, 25 October 2026, base
`c2569dc` (preserve-until-cleanup, PR #67). Nothing here is a production
candidate. The analysis variants live in `variants.mjs` and are applied to an
archived copy of the sources; the checked-out runtime is unchanged.

## Conclusion (closed, 25 October 2026)

The study is finished at commit 04622e3; (c) is not productionized.

- **CPU: lazy retention works.** Lazy reactivation keeps exact semantics
  (40,000 of 40,000 differential traces), adds nothing to the push, pull or
  tracking hot paths, and never does worse than cleanup. It reuses 96–100%
  of available retained identity in the oracle corpus and in
  D.list.filter-select, cutting that workload from 33.4 to 4.2 links per
  step (0.91–0.93× per step).
- **Production blocker: memory ownership and global representation cost.**
  A retained edge holds its producer from outside the producer's outgoing
  list. Retention that is neutral at drop time can still extend a lifetime
  later (orphaned-\*). Making it neutral for the whole lifetime needs a
  producer-side latent list on top of the consumer-side field: a second
  adjacency and +8 bytes on every node, paid by all graphs for a gain
  confined to conditional dependencies that flip back.
- **The runtime keeps only PR #67** (preserve the unvisited suffix until
  cleanup). Everything on this branch is analysis-only.

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
  - `lazy-identity-shared-at-drop` (first called `-neutral`) retains a
    dropped edge only when its producer keeps another subscriber after the
    unlink. At that moment retention extends no lifetime; later it can (see
    Memory).

**Decisions so far (owner, 25 October 2026).** Plain horizon; strict stays
only as a control: it loses the gap-2 and gap-4 reuse and does not bound
dormant retention either, because its expiry waits for a computation that
may never come. The representation is (c)'s dedicated field. No deeper
retained lookup until measured (see Out-of-order resurrection).

## Semantics

`differential.mjs --base HEAD --candidate HEAD+<variant>`, 40,000 programs
(oracle, hub, and targeted wide consumers), invariant checks on both sides.

| variant                          |               identical traces | other                                                                |
| -------------------------------- | -----------------------------: | -------------------------------------------------------------------- |
| (a) retain-one-epoch             | 5,236 of 8,000 (a smaller run) | 2,763 semantic divergences: its retained edges are real dependencies |
| (b) retain-identity              |                         39,998 | a stack-overflow depth; the nested self-recompute (8688)             |
| (c) lazy-identity                |                     **40,000** | none                                                                 |
| (c) lazy-identity-strict         |                     **40,000** | none                                                                 |
| (c) lazy-identity-shared-at-drop |                     **40,000** | none                                                                 |

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

| policy             | links per step | reactivations per step | time per step / cleanup |
| ------------------ | -------------: | ---------------------: | ----------------------- |
| cleanup            |           33.4 |                      0 | 1                       |
| (c) lazy           |            4.2 |                   29.2 | 0.93 (0.88–0.98)        |
| (c) shared-at-drop |            4.2 |                   29.2 | 0.92 (0.83–0.97)        |
| (c) strict         |            4.2 |                   29.2 | 0.91 (0.88–0.96)        |

The whole step (writes, recomputes, watcher runs) is 7–9% faster.

Reports produced before the rename (`sweep-003.json`, `dlist-001.json`,
`memory-001.txt`) label shared-at-drop as `neutral`.

### Memory

`memory.mjs`, one `--expose-gc` process per run, median of 3
(`bench-results/structural-retention/memory-001.txt`):

| policy              | bytes per producer + computed pair | bytes per dormant consumer | dropped producers alive | churn bytes per cycle |
| ------------------- | ---------------------------------: | -------------------------: | ----------------------: | --------------------: |
| cleanup             |                              368.8 |                     10,847 |                      0% |                    61 |
| (b) retain-identity |                              368.9 |                     20,770 |                    100% |                    62 |
| (c) lazy            |                              384.8 |                     20,905 |                    100% |                    62 |
| (c) strict          |                              384.9 |                     20,905 |                    100% |                    62 |
| (c) shared-at-drop  |                              384.8 |                 **10,921** |                  **0%** |                    63 |

- **"Dormant" setup.** 2,000 live computeds each drop 8 producers with a
  1 KiB payload and never compute again.
- **"One epoch" means one consumer epoch, not wall time.** A consumer that
  never computes again keeps its retained producers as long as it lives, and
  strict expiry does not help.
- **Shared-at-drop removes that cost for the dormant case.** It retains only
  edges whose producer stays reachable through another subscriber at drop
  time; what remains is the field (+8 bytes per node).
- **It is not lifetime-neutral afterwards.** If the other subscribers later
  drop the producer too, the retained edge, absent from the producer's
  outgoing list, still keeps it alive. `memory.mjs` orphaned-\*: 2,000
  pairs of computeds share 8 producers (1 KiB payload). C1 drops them while C2
  still reads them, then sleeps; C2 then drops them or is disposed
  (`memory-002.txt`):

  | scenario                                          | cleanup   | lazy         | shared-at-drop   |
  | ------------------------------------------------- | --------- | ------------ | ---------------- |
  | C2 drops: bytes per C1, shared producers alive    | 1,530, 0% | 12,188, 100% | 11,548, **100%** |
  | C2 disposed: bytes per C1, shared producers alive | 1,039, 0% | 11,043, 100% | 11,044, **100%** |

  The producer cannot know that a cold identity still points to it. The leak
  is bounded: each dormant consumer holds at most the edges of its last
  cleanup, and disposing it releases them. Making retention neutral for the
  whole lifetime needs one of: a producer-side back-reference to its retained
  edges (cold, but a second adjacency), expiry tied to a global quiescence
  generation instead of the consumer's next computation, or accepting the
  bound as a memory policy. Not decided.

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

## Out-of-order resurrection

`order.mjs` builds the candidate (`lazy-identity-shared-at-drop`, plain
horizon) as a PROFILE bundle with analysis-only probes. For every
computation it records R0, the retained set at its start. A read is
_available_ when it is the pass's first read of a producer in R0. Each
available read ends as one of:

- a head hit: reactivated;
- a deeper miss: the chain was live, but its head was another producer;
- a miss after abandonment: an earlier link in the pass had dropped the chain.

η = hits / available. Report: `bench-results/structural-retention/order-001.json`.

| corpus                          | available | head hits |      deeper | after abandonment |         η |
| ------------------------------- | --------: | --------: | ----------: | ----------------: | --------: |
| oracle, 20,000 programs         |       694 |       664 | 2 (depth 1) |                28 | **0.957** |
| D.list.filter-select, 200 steps |     6,533 |     6,533 |           0 |                 0 | **1.000** |

The cross-epoch ladder isolates the order: a consumer reads an anchor and N
producers (16 or 64, each with another subscriber), drops all N for one
computation, then reads them in another order.

| next trace                                                                  | η         |
| --------------------------------------------------------------------------- | --------- |
| same                                                                        | 1         |
| rotate left or right by 1, one mid to front, swap adjacent, reverse, random | 0         |
| every other, same order                                                     | 1 / (N/2) |
| every other, permuted                                                       | 0         |
| new dependency in front                                                     | 0         |
| new dependency in the middle                                                | 0.5       |

- **Head-only depends entirely on order.** The first read that misses the head
  links a new edge, the link abandons the chain, and the rest of the pass
  relinks.
- **A miss costs what cleanup already costs:** the ordinary link, and no
  lockstep steps in these graphs. The mechanism therefore never does worse
  than the baseline.
- **Head-only stays.** In the oracle corpus and in `D.list` the old trace
  order predicts the next one: 96–100% of available identity is reused.
  Following the agreed rule, no deeper search is added. A latent search
  would cost O(|R_C|) against the lockstep's O(min(out(P), in(C))), and it
  only pays where |R_C| is much smaller, or where some cheaper evidence
  exists.

## Open

- **Lifetime neutrality after drop.** See Memory: decide between a
  producer-side back-reference, a quiescence-generation expiry, or the
  bounded leak as policy.
- **Field cost.** +8 bytes per node, and the cold-path checks; a production
  candidate needs the paired CI gate and the shape check.
- **`p₁` prediction.** Deferred until the mechanism above is settled, as
  intended.

## Reproduce

```sh
node perf/structural-retention/differential.mjs --base HEAD --candidate HEAD+lazy-identity-shared-at-drop
node perf/structural-retention/sweep.mjs --ref HEAD --samples 7 --out <report.json>
node perf/structural-retention/sweep.mjs --ref HEAD --policies lazy,shared,strict --no-synthetic --bench D.list.filter-select --out <report.json>
node perf/structural-retention/memory.mjs --ref HEAD --policies identity,lazy,strict,shared
node perf/structural-retention/order.mjs --programs 20000 --out <report.json>
```
