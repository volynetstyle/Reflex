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

Build locally: `bash perf/tape-controller/build.sh <set>` (bundles only; no timing).
