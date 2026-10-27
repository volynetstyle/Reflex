# Outgoing locality of the pair lookup

Research note, 27 October 2026. Base revision: `dev` at `14e8fdb` (two-link
outgoing head start, eager suffix detachment, hint before the head start).
Candidate: `mix-b8`, in `src/kernel/shape/graph/findEdge.ts` on this branch.

**Speculate locally, prove continuously, bound the regret.**

## Question

The tracking tiers predict the next read from the consumer's side: the
cursor, the next edges, the physical tail of `C.in`. When a consumer
reorders its reads beyond that window (a fresh permutation per pass, so
`e = D − LCS ≈ D`), every read pays an exact lookup, and between two wide
endpoints that lookup costs `Θ(min(out(P), in(C)))` links. The long × long
shuffle of ReactivePerformanceLab is that case (about 16× behind the best
competitor at 256 × 128).

Every edge also sits in a second order, the producer's outgoing list, and
that list is **append-only**: edges are linked at `lastOut` and never moved
within `P.out` (reconciliation moves edges only within `C.in`). So `P.out`
lists the consumers in the order they linked the producer, which is the
order in which they ran. When they re-run in that order, the producer is read
by `C0, C1, C2, …`, consecutive in `P.out`, however each consumer orders its
own reads. Incoming locality can be zero while outgoing locality is one, and
any schedule that repeats itself is aligned with `P.out` by construction (the
end-to-end mirror below pulls its computeds in reverse order and is aligned
all the same).

The producer already keeps one finger into `P.out`: its slot (`tailIn` of an
idle producer, INV-H) holds the edge of its last expensive lookup, used so far
only for exactly its own pair. The question: how much of the lookup does the
finger's neighbourhood answer, without new fields, indexes or per-edge memory,
and what does it cost where there is no outgoing locality?

## Result

The finger answers almost all of it where consumers re-run in a stable order,
but the obvious way to use it, an unbounded walk from the finger, hides an
unbounded regression that the benchmark suite cannot see. The candidate,
`mix-b8`, **races** a walk of at most 8 outgoing links around the finger
against the unchanged lockstep:

- the exact hint and the two-link head start come first, unchanged, and the
  head start still answers without writing the slot;
- then, for 16 steps, the lockstep's outgoing link alternates between the
  base walk from the head and the ring around the finger (after, before,
  after, …), while the incoming walkers advance on every step;
- then the base lockstep continues from where every walker stands.

Production timing, Node 24.22, ratio to base (median of 5 samples, one
process per sample, case and bundle; local laptop, read under ~3% as noise):

| case                                             | base ns/read |                 `mix-b8` |
| ------------------------------------------------ | -----------: | -----------------------: |
| lab mirror, shuffle, one watcher pulls (256×128) |          386 | **0.069** (14.7× faster) |
| lab mirror, shuffle, one watcher per computed    |          374 |        **0.083** (12.0×) |
| lab mirror, value-sort (realistic reorder)       |         12.8 |                **0.812** |
| dense shuffle 128×128, forward schedule          |          149 |                **0.143** |
| — with one static subscriber between consumers   |          190 |                    0.210 |
| — random half of the consumers per round         |          148 |                    0.274 |
| — the same, with a static between                |          186 |                    0.452 |
| — random schedule (no outgoing locality)         |          148 |        0.861 (0.83–0.91) |
| — random schedule, static between                |          186 |        0.902 (0.83–1.00) |
| adversary head-far-3, static between             |           73 |        0.875 (0.82–0.97) |
| adversary far-pair, static between               |          173 |        0.889 (0.85–0.97) |
| sliding window, random schedule                  |           84 |        1.020 (0.77–1.11) |
| hub re-read, forward / random                    |      4.8–5.1 | 1.07 / 0.98 (±20% noise) |

## Variants and the regret principle

All in `variants/<name>.findEdge.ts`, complete copies of `findEdge.ts` that
differ only in the lookup. Every variant keeps the exact-pair answer, writes
the slot only under the base guard (neither Computing nor Watcher) and only
with an edge it has located, and keeps the proof of absence.

| Variant                      | With a finger (`slot.from === P`, not the pair)                                      |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| `next`, `next-prev`, `next2` | fixed probes around the slot, then base                                              |
| `cyclic`                     | lockstep with the outgoing side from the slot, wrapping; no head start               |
| `bidir`                      | two outgoing walkers around the slot per step                                        |
| `zigzag`, `ring`             | one outgoing link per step, alternately after and before the slot (`ring`: wrapping) |
| `ring-head`                  | base head start, then `ring` instead of the lockstep                                 |
| `head-rR`                    | base head start, then ±R ring probes, then base                                      |
| `lock-bB`                    | base head start, then a lockstep whose first B outgoing links come from the ring     |
| `mix-bB`                     | as `lock-bB`, alternating ring and base walk for 2B steps                            |

What the measurements forced, in order:

1. **The hypothesis holds.** Dense core, 128 consumers × 128 sources,
   shuffled reads, consumers in `P.out` order: λ⁺ = 99% (the next reader's
   edge is the previous reader's `nextOut`), and with the slot the base
   revision actually leaves, the looked-up edge is `slot.nextOut` in 84% and
   within two steps in 96% of lookups. `ring` goes from 64.3 to 1.3 links per
   read, 149 → 19.9 ns/read.
2. **Fixed probes need the right direction and no gaps.** `next` is useless
   against the order or with one static subscriber between consumers;
   `cyclic` is 1.22× slower in reverse; `bidir` starves the incoming walkers
   (1.68× slower on random schedules with gaps, at equal links).
3. **An unbounded finger has unbounded regret.** `ring` passed the local
   paired comparison of the benchmark suite (no workload slower), yet compares
   **169× more links** than base when two consumers alternate, one at the head
   of every `P.out`, one in the middle (`head-far`). Base answers the head one
   by the head start, which does not write the slot, so the middle one keeps
   its exact hint. `ring` writes the slot on every find and destroys that
   hint. `ring-head` (head start first) repairs that case but is still
   1.46× slower on `head-far-3` with gaps (range 1.36–1.60): a far finger
   walked instead of a head that was two links away.
4. **Bounded probes stall the proof.** `head-r2` (±2 probes, then base) is
   bounded, but its probes run before the lockstep: when the incoming side
   would have answered at once, the probes are paid anyway (sliding window
   with a random schedule +7–12%, random schedule with gaps +9%).
5. **Racing keeps the proof running.** `lock-bB` takes the ring links inside
   the lockstep, so incoming finds cost nothing extra, but delays the base
   walk by B steps (`head-far-3`, gaps: +22% links at B = 8). `mix-bB`
   alternates the two, so the base walk only runs at half pace for 2B steps.

The principle every tier of the tracker turns out to share: **a fast path
needs a cheap hit and a cheap miss, and the miss must not stall the general
proof.** For `mix-bB`, against the base lookup on the same slot state:

- an edge the incoming side reaches costs the same number of steps;
- an edge the base outgoing walk reaches as its j-th link costs at most
  `min(j, B)` more steps (three links each);
- absence proved by the incoming side costs the same; by the outgoing side,
  at most B more steps.

So `W_mix ≤ W_base + O(B)` with a constant independent of `D` and `K`, while
the saving on a structured dense reorder is `Θ(min(out, in))` per lookup.

**Budget.** Links per read relative to base, over the matrix of
`analyze.mjs` (read orders × schedules × gaps 0/1/3, and the lab mirror):

| group                         |   B=2 |   B=4 |   B=6 | **B=8** |  B=12 |  B=16 |  B=24 |
| ----------------------------- | ----: | ----: | ----: | ------: | ----: | ----: | ----: |
| lab mirror, geomean           | 0.142 | 0.101 | 0.097 |   0.094 | 0.094 | 0.094 | 0.094 |
| structured shuffles, geomean  | 0.697 | 0.445 | 0.402 |   0.301 | 0.284 | 0.273 | 0.268 |
| adversarial shuffles, geomean | 1.010 | 1.014 | 1.016 |   1.017 | 1.020 | 1.022 | 1.026 |
| worst case                    | 1.053 | 1.079 | 1.079 |   1.079 | 1.083 | 1.104 | 1.135 |

The lab mirror saturates at 8, the worst case is flat from 4 to 8 and rises
after it: B = 8 is the knee, chosen by the curve, not by a single benchmark.

## Where the gain comes from

Route migration, per pass, base → `mix-b8` (`analyze.mjs`, routes split by
the side that found the edge; `race+` = found by the base walk or an
incoming walker while the finger raced):

| case                       | moved                                                   | links per lookup |
| -------------------------- | ------------------------------------------------------- | ---------------: |
| lab shuffle, pull          | `lock+` 29,470 → `finger` 29,121 (+347 `race+`)         |       108 → 3.96 |
| lab shuffle, watchers      | `lock+` 29,470 → `finger` 28,966                        |       108 → 10.1 |
| lab value-sort, pull       | `lock+` 1,047 → `finger` 1,039                          |      34.1 → 2.98 |
| head-far-3, static between | `lock+:out` 31.9 → `race+:out` 31.9 (same finds, later) |      29.9 → 30.8 |
| sliding window, random     | `lock+:ahead` 116 → `race+:ahead` 116                   |    17.02 → 17.07 |

The number of lookups per pass and the counts of every other tier (`head`,
`newest`, `hint`, the consumer-side tiers) are identical in every case: the
finger changes the locate step and nothing the tracker decides. On the 61
ladder rungs and benchmark workloads, 58 compare exactly the links of base;
the other three improve (shared shuffle 0.061, nested hub 0.090, shared
window 0.747).

## Correctness and qualification

- Graph-level differential fuzz (`scripts/fuzz-tracking-graph.mjs`): 200,000
  scenarios of 30 operations identical to `14e8fdb` (incoming and outgoing
  order, edge identity, stamps, frontier after every read), INV-H held after
  every read and operation, 196,148 scenarios end with a live hint.
- `--qualify`: all 14 seeded mutants killed, among them five of the race:
  a ring started from a slot edge of another producer, an incoming walker
  that claims absence early, a dropped base-walk hit, a hand-off to the base
  lockstep that loses the base walk, and a slot written before the lookup
  ends (an INV-H violation on a Computing node).
- Mutants that change only cost or slot content do not change the graph, so
  the fuzz cannot see them. The replay of `analyze.mjs` must: it fails when
  the bundle's compared links differ from the model's on any lookup. Caught:
  ring order swapped, budget 7, base walk frozen, incoming walker frozen,
  base walk on the other parity, finger never used. Not caught, and recorded
  as equivalent in these workloads: the three ring wraps. The base walk, at
  half pace, reaches a head-of-list consumer before the ring wraps to it, and
  the initial forward wrap needs a finger at `lastOut`, which the slot never
  receives (the newest probe answers that edge without a write) unless the
  edges behind it are later unlinked. The wraps stay as one `??` each.
- Unit suites: 401 + 24 (projection) + 39 (dev) tests, RULES citations,
  `tsc --noEmit`.
- Paired comparison (`bench/compare.mjs --quick`, Node 24.22, 12 replicates,
  layout-randomized, all 32 timed workloads, against `14e8fdb`): nothing
  slower, nothing faster; 17 equivalent, 15 inconclusive by interval width
  only, every median within ±1.4% (`A.track.hub-duplicate` −0.2%,
  `A.track.reorder-128-shuffled` 0.0%). The paired CI run of the
  `runtime-bundle-change` gate is still to do.
- TurboFan shape (`perf/v8-shape`, readable production bundles, Node 24.22):
  29 of 32 workloads have identical instruction counts in every optimized
  function; `resolveTrackedRead`, where the locate stage is inlined into it,
  differs by one instruction on `B.fanin.width-1000` (+1) and
  `D.list.filter-select` (−1); the third difference is the harness's
  `hrtimeBigInt`, which is optimized in some runs only.

## What stays at the bound

- **No outgoing locality.** Consumers that re-run in an order unrelated to
  `P.out` (random schedule) gain nothing; the race costs them 0.86–1.02 of
  base in time.
- **Absence.** A finger is a positive answer only. New dependencies between
  wide endpoints keep the lockstep's proof of absence (most of what remains
  in the sliding window).
- **Stale blocks on the consumer side.** In the sliding window every read
  skips the same block of dropped edges in front of the cursor, which no
  producer-side state fixes; `../tracking-ladder/variants.mjs` `rotate`
  (parked research) removes it and composes with the finger (`ring+rotate`
  on the window: 0.24 of base in links).

## Workloads

- `scripts/tracking-outgoing-locality.mjs`: a dense core, `K` consumers
  reading the same `D` sources after one shared selector, kernel API. Read
  order (`stable`, `shuffle`, `shared-shuffle`, `hub`, `window-4`) ×
  schedule (`forward`, `reverse`, `alternate`, `rotate`, `subset-half`,
  `swap-pairs`, `random`, and the adversaries `head-far`, `head-far-3`,
  `far-pair`) × gap (static subscribers between consecutive consumers).
- `scripts/tracking-lab-long-long.mjs`: the lab's long × long on the protocol
  API (computeds, a selector write, one pulling watcher or one watcher per
  computed), so the schedule is the runtime's own.
- `scripts/tracking-ladder.mjs` rungs and the timed `bench/workloads.mjs`,
  for what must not change.

## Tools

```sh
# tiers, routes, links, slot distances, λ (PROFILE bundles, replay checked)
node perf/outgoing-finger/analyze.mjs --variants base,mix-b8 \
  --reads shuffle --schedules forward,random,head-far-3 --gaps 0,1 \
  [--lab shuffle --observers pull,watchers] [--ladder all] [--workloads all] \
  [--commit source --variants candidate] [--mutate <file>::<from>::<to>]

# production timing, one process per (sample, case, bundle)
node perf/outgoing-finger/time.mjs --node <node 24> \
  --bundle base=@HEAD --bundle mix-b8=@HEAD+mix-b8 --reads shuffle ...
```

A variant may add mutations of `../tracking-ladder/variants.mjs` with `+`
(`ring+rotate`). `scripts/build-baseline-oracle.mjs --overlay <file>=<path>`
replaces an archived source file before bundling. Measured data:
`bench-results/outgoing-finger/`.

**Measures.** λ⁺/λ⁻: for every read of `P` by a consumer other than its
previous reader, whether the pair's edge is the `nextOut`/`prevOut`
neighbour of the previous reader's edge (an ideal finger refreshed on every
read, not a policy). slot±d: for every lookup that finds an edge while the
slot holds another edge of the producer, the distance between them. Links:
edges compared by the lookup, counted by the PROFILE bundle and reproduced by
a model of every variant.
