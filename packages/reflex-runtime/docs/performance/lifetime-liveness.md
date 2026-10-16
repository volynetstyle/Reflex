# Lifetime vs liveness: results of experiments A-D

Starting hypothesis: Reflex needs graph pruning that automatically removes
unneeded regions of the graph. The hypothesis is **closed as not showing
enough practical value**. Ownership and disposal stay as they are; the hot path
(`push_iterator`, `pull_iterator`, `advance`, the tracking protocol) does not
change. Suspension/reactivation is moved to an optional research branch with
a measured break-even point (section D).

Code: `test/perf/lifetime-churn/` (README there). Data:
`bench-results/lifetime-churn/{report,reactivation}.md` and `.json`.
Counters come from a `__PROFILE__` build; time comes from the same build and is
only good for comparing rows with each other.

## What was checked

| Hypothesis | Experiment | Result | Verdict |
|---|---|---|---|
| Managed ownership accumulates graph garbage | A | 10,000 cycles: edges 1205 → 1205, push 702.5 → 702.5 per write, 0 retained objects | Not confirmed |
| Raw computeds without disposal are retained by producers | B | +5 edges and ~1.15 KB per cycle, push per write ×22 after 10,000 cycles | Confirmed |
| Unobserved computeds lead to expensive recomputation | B, C | pull and compute do not change; dirty cutoff cuts push | Refuted for these workloads |
| Disposing a watcher leaves unobserved dependencies | C | a residual graph exists, visible only in the tail | Confirmed |
| Removing those dependencies noticeably improves normal work | C, D | at most −0.7% of work, and only with hundreds of writes while dormant | Not confirmed |

## A/B: lifecycle solves accumulation

A (`useSignal`/`useComputed`/`useEffect` + `disposeOwnershipNode`) matches
manual `disposeNode` in graph and counters. Ownership costs about 1.1 MB of
constant heap for 200 live components and does not grow.

B (`disposeWatcher`, computeds abandoned, exactly what `computed()` gives)
grows linearly but boundedly: abandoned nodes stay dirty, and push stops at the
first edge into them. A quadratic cost appears only when the effects
themselves leak (`raw-no-dispose`). The raw API needs an explicit lifecycle
contract, not a graph collector.

## C: the boundary between ownership and liveness

As long as shared computeds still have some of their observers, there are
almost no unobserved edges (125 of 9140 with 1024 of 4096 watchers). With 128
watchers, retain visits 269 more edges per write than the oracle (+40%); with 0
watchers it is 144 visits for 6070 edges in the graph. Reflex does not pay for
the whole retained subgraph but for its **boundary reachable from the written
producer**.

`oracle-prune` is a lower bound on the structural cost, not a semantically
equivalent implementation. A computed owned by a live owner must stay readable
under the same caching contract even when there are no watchers:

    theoretically removable graph ≠ graph that may be destroyed

So the remaining ~0.85 MB in C is not necessarily a leak: it may be
legitimately retained state of reachable computations. The right framing is
not disposal but **suspension**, that is, detaching an unobserved computed
from push while preserving its lifetime, read correctness and cache.

## D: deactivate → W writes → reactivate

Two regions of 4×128 computeds each. A is always observed. B loses all its
watchers and then gets new ones over the same handles. Shared producers feed
both regions, foreign producers only A. Every reactivation is checked against
a reference computation in plain JS: 0 mismatches in all 40 configurations,
and the region's edge count is stable between cycles.

Variants for B while dormant:
- `retain`: current behavior;
- `suspend-conservative`: unlink the sources and mark Changed;
- `suspend-oracle`: unlink; on activation restore the same edges and recompute
  only the nodes whose producers were written while dormant. This is an ideal
  freshness check with zero bookkeeping cost, i.e. an upper bound for
  suspension;
- `dispose-recreate`: acceptable only where the lifecycle allows it.

Break-even model: `W · S_w > C_d + C_r`.

| quantity | measured |
|---|---|
| `S_w`, savings per write into a shared producer | ≈ 24 edge visits: only the producers' direct edges into B's lowest layer (384 edges / 16 producers) |
| `C_d`, detaching | +1510 removed edges |
| `C_r`, restoring | +1510 created edges (oracle); additionally 498 computes (conservative, dispose) |
| `S_w` with writes only into foreign producers | 0: retain does not go there at all |

Total work (push + pull + compute + created and removed edges) relative to
retain:

| W | shared, oracle | shared, conservative | foreign, oracle | foreign, conservative |
|---:|---:|---:|---:|---:|
| 0 | +98.8% | +113.7% | +98.8% | +113.7% |
| 1 | +34.3% | +36.5% | +50.8% | +58.5% |
| 10 | +5.2% | +5.1% | +9.5% | +10.9% |
| 100 | −0.2% | −0.2% | +1.1% | +1.3% |
| 1000 | −0.7% | −0.7% | +0.1% | +0.1% |

- The break-even point is around **W ≈ 90 writes** into the affected producers
  while the branch is dormant. That is below the naive estimate
  `3020 / 24 ≈ 126`, because retain also pays: the first write marks the whole
  dormant branch, and on activation it recomputes it as well.
- If the writes do not touch the dormant branch, suspension never pays off: a
  fixed tax of +3020…3478 units of work.
- The maximum gain is −0.7% of work at W = 1000. In time it is
  indistinguishable from noise (±5%).
- Memory while dormant: conservative −130…160 KB, dispose −230…300 KB. Oracle
  equals retain in memory, because the saved source list costs as much as the
  edges.
- Referential identity of results: retain and oracle keep 100% if the branch
  was not touched; conservative and dispose always lose it (0%).
- Even an ideal suspension that ignores the cost of the freshness check gives
  less than 1%. A real mechanism (version vectors, boundary bookkeeping) would
  cost more.

## Comparison with Angular and Preact

Harness: `packages/reflex/bench/liveness/` (README there), report
`bench-results/liveness/report.md`. It compares `@angular/core` 22.2.0
`primitives/signals`, `@preact/signals-core` 1.14.4 and the production Reflex
facade under **the same lifetime contract**: all computeds are retained for the
whole run, effects are released explicitly. Time: production builds, 5 runs in
fresh processes, median. Structure: a deterministic pass with identically
defined counters. Everything is checked against a reference; the observed sums
of the three libraries match, and so do the numbers of computes and effects.

A correction to the interpretation of C: Angular (`producers`) and Preact
(`_sources`) keep direct references to dependencies on non-live computeds.
Liveness saves work on writes, not necessarily memory, so the retain/oracle
difference in C (0.85 MB) is not an estimate of their advantage.

DAG: 64 producers, 4×512 computeds, 256 watchers × 3 reads of the top layer.

**observer-toggle**: remove the watchers, make k writes, restore the watchers.

| share of watchers, writes per cycle | Reflex | Preact | Angular | subscribes+unsubscribes per cycle, Reflex / Preact / Angular |
|---|---:|---:|---:|---|
| 100%, 0 | 97 µs | 332 µs | 489 µs | 1536 / 12368 / 12396 |
| 100%, 1 | 197 µs | 441 µs | 910 µs | same; poll 290 / 4813 / 4825 |
| 100%, 10 | 323 µs | 533 µs | 1.12 ms | |
| 25%, 1 | 170 µs | 187 µs | 333 µs | 384 / 802 / 802 |

A full live ↔ non-live transition recursively rebuilds the membership of the
whole DAG: about 6200 operations in each direction versus 768 edges of the
watchers themselves in Reflex. If the observers overlap (25%), the DAG stays
live, the transition is cheap, and Preact nearly catches up with Reflex.

**standalone-reads**: reads of unobserved computeds interleaved with writes to
signals nothing depends on.

| reads per unrelated write | Reflex | Preact | Angular | polls per read, Preact / Angular |
|---|---:|---:|---:|---|
| no writes | 49 ns | 60 ns | 71 ns | 0 / 0 |
| 100 | 60 ns | 421 ns | 873 ns | 33 / 33 |
| 10 | 87 ns | 787 ns | 1.9 µs | 93 / 93 |
| 1 (time includes the write itself) | 130 ns | 814 ns | 2.8 µs | 115 / 116 |

The hypothesis is confirmed: after any write, a global `epoch` or
`globalVersion` forces a non-live computed to poll upstream. Reflex does no
checks (0 polls); its clean flag is changed only by a real push.

**dormant-writes**: one departure of the observers, W writes into the DAG's
producers, one return.

| phase | Reflex | Preact | Angular |
|---|---:|---:|---:|
| deactivate | 86 µs | 310 µs | 461 µs |
| write while dormant (steady state, W = 10,000) | 269 ns | 90 ns | 118 ns |
| reactivate | 531 µs | 647 µs | 1.01 ms |
| total at W = 100 | 0.88 ms | 1.00 ms | 1.57 ms |
| total at W = 10,000 | 3.31 ms | 1.86 ms | 2.65 ms |

Here liveness wins, as expected. Reflex pays about 22 edge visits
(≈150-180 ns) per dormant write, the dirty-cutoff boundary. In exchange, the
transition itself is cheaper in Reflex by ≈340 µs (Preact) or ≈850 µs
(Angular). The break-even point of liveness: **≈1900 dormant writes per
observer departure for Preact and ≈5700 for Angular** on this DAG.

### The model `W·S > R·P + A·T` with measured quantities

| quantity | value on this DAG |
|---|---|
| `S`, liveness savings per dormant write | 150-180 ns (≈22 edge visits in Reflex versus 0) |
| `P`, extra cost of a read after an unrelated write | 0.4-0.8 µs (Preact), 0.8-2.7 µs (Angular); 33-116 dependency checks |
| `T`, a full live ↔ non-live transition | ≈0.34 ms (Preact), ≈0.85 ms (Angular) above Reflex |

The stated hypothesis, that a persistent bidirectional graph with a correct
lifecycle and dirty cutoff is cheaper than dynamic subscriptions on workloads
with frequent observability changes and repeated reads, is **confirmed** on
observer-toggle and standalone-reads. It is **refuted** (as expected) on
dormant-writes when W exceeds roughly 2-6 thousand writes per observer
departure.

No strategy dominates. Reflex's bidirectional graph is a deliberate
trade-off: work moves to writes into a dormant branch, while transitions and
reads become cheaper. Limitations: one DAG and one set of sizes; on small
graphs with small dependency cones `P` and `T` will be smaller. The
competitors' advantages with a raw API without lifecycle (abandoned computeds
collected by GC) were deliberately not measured here.

## The clear advantage of Angular and Preact

On this axis they keep one real advantage, and it should not be hidden: **a
raw API without lifecycle**. A forgotten standalone computed can become
GC-collectable for them, because the producer holds no strong subscription to
it while it is unobserved. In Reflex every edge is bidirectional, and B shows
the direct consequence: without disposal, abandoned computeds accumulate
linearly (+5 edges and ~1.15 KB per cycle, push per write ×22 over 10,000
cycles). This is a lifecycle problem, not a liveness problem. It is solved by
a contract: `createDisposableComputed`, an owner, or `disposeNode`. A graph
collector is not needed for it.

## Decisions (closed)

The architectural statement used in the documentation:

> Reflex intentionally retains dependency subscriptions for live owned
> computations. Dormant propagation is bounded by dirty-state cutoff rather
> than by dynamically disconnecting inactive dependency cones.

1. Keep managed ownership as it is.
2. Document the raw API explicitly as requiring lifecycle/disposal
   (`RUNTIME.md` → Dependency retention, the README of both packages). The
   root of `@volynets/reflex-runtime` currently exports no consumer disposal
   (`disposeNode` exists only in `/internal`), and the facade only through
   `createDisposableComputed`.
3. Do not introduce automatic pruning.
4. Do not introduce suspension.
5. No liveness bit, active-subscriber count or second edge class in the hot
   node shape.
6. Do not complicate the push/pull hot path for this.
7. Revisit the question only if a real workload turns out to lie far to the
   right of the break-even point found.

## When to revisit

The criterion of item 7. On the measured DAG the break-even point is ≈1900
(Preact) and ≈5700 (Angular) dormant writes per observer departure, with no
unrelated writes between reads and with rare observer changes. Suspension in
Reflex itself paid off from ~90 writes into the affected producers and gave at
most 0.7% of work.

Reconsider if all of the following hold at once:
- the dormant branch has a large **direct** fan-in from frequently written
  producers (`S` in the hundreds of edges, not tens);
- there are orders of magnitude more dormant writes than nodes in the branch
  and observer departures;
- the branch cannot be closed through an owner.

Then repeat D and the comparison with Angular/Preact on that graph shape,
keeping the correctness check, and account for the cost of a real freshness
check instead of the oracle.
