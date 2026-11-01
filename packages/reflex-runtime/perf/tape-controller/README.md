# Tape controller experiments (research)

Timing for the prepared-tape admission study (INV-P, `src/kernel/shape/graph/tape.ts`).
Runs on CI only: `.github/workflows/research-tape-controller.yml`, on push to
`research/cost-sensitive-strike`. One runner per experiment; compare within a job.

Workloads are runtime-only replicas of the ReactivePerformanceLab long×long and
sustained shapes (replace-half, window-slide, shuffle, shared-shuffle,
hub-duplicate, value-sort, stable) at deps 64/256 × consumers 16/128. Every
transition's sum is checked. One process per (sample, case, bundle), bundle
order rotated per sample; a ratio is the median of per-sample ratios.

| set | bundles | question |
| --- | --- | --- |
| `kgrid` | `k<K>`: strike when the plain lockstep reaches step K (commit 613d231); `e<K>`: a strike every K steps | does lookup cost separate useful from wasted prepares? |
| `foreign` | `nf-rec`: a foreign recorded cell is no finger; `nf-live`: only while its lease is live; `nf-ns`: plain lockstep without strike instead | total effect of refusing prepared cells as fingers |
| `schedule` | `s-<v>` from `overlays/schedule` (`generate.py`): `half` = dev's 50/50 race; `rounds` = base + one finger probe + incoming per round; `rounds2` = incoming twice; `ffrounds` = finger probe first; `-early` = return on the outgoing certificate as soon as `out` becomes null | finger-race schedule, controller frozen for every finger lookup |
| `rounds` | live controller; `base`/`k16`/`np` = dev a7858fa, the K=16 gate (613d231), no prepare; `cur`/`k16r`/`npr` = the same three on ae2fdd0 (finger-first rounds, K=16 ported in `overlays/rounds`) | does bounding the finger race shrink the tape's external harm? |
| `frozen` | `fz-a` (dev search) and `fz-b` (no race on a foreign recorded cell), both under the strike history recorded from `fz-a` | controlled direct effect of the finger race, controller frozen |

Frozen controller. The producer slot changes only by the final hint write,
the prepare and unlink clearing, never by a search, so all builds see the same
lookups with the same slot state at every lookup boundary. The only controller
input that can differ is whether a lookup with a foreign recorded cell struck
(at most once). `fz-a` records that bit per such lookup with fixed transition
counts; timed `fz-a` verifies it, `fz-b` replays it after its plain lockstep.
Every timed run must reproduce the recorded prepare/release hash and consume
the whole trace, else it fails. Read `B'/A'`; `A'/base` is the cost of the
instrumentation shape.

Schedule experiment. The controller is frozen for every finger lookup: in
record mode the finger path is dev's race with live strikes and one bit per
lookup records whether it struck; each timed variant runs its race without
strikes and replays the bit at the end of the lookup. `findEdgeInLockstep`
must keep dev's bytecode in every variant (`bytecode-check.mjs`, run by
`build.sh schedule`; the extra check of `nf-rec` adds 12 bytes and fails it).
Settlement counters (which walker settles each finger lookup, probes spent)
are deterministic: `python overlays/schedule/instrument.py` builds counting
overlays, `node schedule.mjs count` prints them.

CI runs only the experiments listed in `ci.json`.

Build locally: `bash perf/tape-controller/build.sh <set>` (bundles only; no timing).

## `rounds`: prediction, recorded before the run (2026-11-01)

The earlier x16 regression of the current admission (K=16/current ≈ 0.85 on
replace-half x16, run 41252710453) was attributed to prepared cells becoming
fingers of other consumers' absence lookups. Finger-first rounds bound a
foreign finger's cost to the lockstep's own rounds plus a constant. If that
was the main channel of external harm:

- x16: `k16r/cur` → ≈ 1 (from ≈ 0.85 for `k16/base` in the same job), and
  `npr/cur` closer to 1 than `np/base`;
- x128: `cur < npr` still (the tape pays for itself where lists are long).

If `k16r/cur` stays near 0.85, the harm lives elsewhere: exact-hint eviction,
the strike/prepare feedback loop, the prepare itself, or code shape. Counters
from `count.mjs` (prepares, strikes, foreign-cell finger lookups, steps) show
whether the rounds changed the controller's own dynamics.

### Result (CI run 41294654148, Node 24, 9 samples; noise: `stable` is bimodal 0.73–1.35, read ±5% as nothing)

| case | k16/base | np/base | k16r/cur | npr/cur | cur/base |
| --- | ---: | ---: | ---: | ---: | ---: |
| replace-half 64x16 | 0.868 | 0.872 | 0.908 | 0.916 | 0.923 |
| replace-half 256x16 | 0.876 | 0.878 | 0.934 | 0.951 | 0.920 |
| replace-half 256x128 | 1.038 | 4.610 | 1.046 | 4.677 | 0.981 |
| window-slide 256x16 | 1.092 | 1.127 | 1.027 | 1.069 | 0.948 |
| window-slide 256x128 | 1.043 | 4.639 | 1.054 | 4.841 | 0.987 |
| hub-duplicate 256x128 | 1.004 | 1.068 | 0.999 | 0.994 | 1.029 |

- x16 external tax of the tape: 12–13% before, 5–9% after the rounds. Halved,
  not gone. The no-tape floor did not move (`k16r/base` 0.875 ≈ `k16/base`
  0.868); the taped path got cheaper (`cur/base` 0.92). The counters agree:
  without a tape replace-half x16 has no finger lookups and more lockstep
  steps, so the remaining harm is the fixed cost of entering the finger path
  plus the prepare, not race length (the rounds never bounded anything here).
- x128: the tape still pays 2.7–4.8x. Prediction held.
- window-slide x16: the tape helps in both (foreign cells as useful fingers).
- hub-duplicate: the rounds raised prepares 8x (counters) at ~+3% (256x128).
- K=16 still loses 4–10% on x128 and window-slide: no admission rule wins.

Next lever: the per-lookup fixed cost of the finger path (inline budget of
resolveCursorTrackedReadMiss), not admission.

## `budget`: does the finger path's call boundary matter? (prediction, 2026-11-01)

On replace-half 64x16 the counters give `cur` 384 calls of
findEdgeInLockstepFromFinger plus 42 of PastHeadStart per transition, and
`npr` 416 calls of PastHeadStart: the same number of out-of-line lookups,
and `cur` takes fewer steps (2447 vs 2912). The `npr`/`cur` gap there is
therefore different work (finger probes into other consumers' edges, the
prepare and its release), not compiler shape. With
`--max-inlined-bytecode-size-cumulative=1500` V8 inlines FromFinger into
resolveCursorTrackedReadMiss (inlining.mjs; 952 bytes). The flag changes
every compilation unit, so read the pairs at equal budget.

Prediction: `npr@1500/cur@1500` ≈ `npr/cur` on replace-half x16 (the gap is
work); `cur@1500/cur` < 1 mainly where finger calls dominate (shuffle and
shared-shuffle x128: ~6k–30k finger lookups per transition).

### Result (CI run 41296455535)

- Prediction 1 held: on replace-half 64x16 `npr/cur` 0.927 and
  `npr@1500/cur@1500` 0.926. The x16 gap is work, not the finger call.
- Prediction 2 was too narrow: the larger budget speeds up almost every
  miss-heavy case for both `cur` and `npr` (`cur@1500/cur`: shuffle and
  shared-shuffle x128 0.83–0.89, value-sort 0.76–0.79, hub 0.87–0.95,
  replace-half and window 0.91–0.95; `stable` 0.98–0.99, it never misses).
  Inlining trees (inlining.mjs, Node 24.22.2) place the gain at the outer
  boundary: at 1500 readProducer or advanceCore inline the whole resolve
  chain (resolveTrackedRead → resolveCursorTrackedReadMiss →
  findEdgeInLockstep → reconcileLocatedRead), while at 920 resolveTrackedRead
  or the cursor miss stays a call. On shuffle 256x128 the cursor miss inlines
  FromFinger even at 920.

So the shape target is the cumulative size of the read-miss chain under
readProducer/advanceCore (upper bound 5–25% on miss-heavy shapes), not the
finger continuation.

## `shape`: one never-inlined miss handler (prediction, 2026-11-01)

`m2` (523f550, perf/tracking-finger-shape) merges the three miss handlers and
the reconciliation into one function above V8's single-inlining limit, so
resolveTrackedRead stops absorbing them and inlines into its readers. Same
work (exact differential, identical counters). Prediction: `m2/cur` < 1 on
the miss-heavy shapes, part of `cur@1500/cur` (0.77–0.89 on shuffle,
shared-shuffle and value-sort), and ≈ 1 on `stable`; `m2/cur@1500` tells how
much of the budget bound the new shape keeps.
