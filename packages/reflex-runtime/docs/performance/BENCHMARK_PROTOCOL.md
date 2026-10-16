# Runtime benchmark protocol

Implementation: `bench/workloads.mjs` (specification), `bench/worker.mjs`
(one measurement process), `bench/compare.mjs` (paired comparison).

## Principles

1. **Measure mechanisms, not scenarios.** Every workload names the kernel
   mechanism it isolates, its semantic preconditions, how the graph is
   prepared, what the measured step contains and what is excluded.
2. **Same work on both sides.** A deterministic `verify` replay must produce
   identical output for baseline and candidate; a differing workload is
   reported `invalid`, never as faster or slower.
3. **Production code only.** Both sides are production bundles (production
   flags, minified) built by the same toolchain from a commit or the working
   tree (`scripts/build-baseline-oracle.mjs --production`). Instrumented DEV
   or source-mode vitest timings are not used for comparisons.
4. **Compare inside one process, replicate across processes.** Clock
   frequency on laptops and shared runners moves by tens of percent between
   processes (turbo budget, thermal state, P/E-core placement), far more
   than the effects worth measuring. Both builds therefore run in the same
   process, alternating sample batches, so slow drift hits both sides
   equally. Iterations inside one process are still correlated, so the
   process remains the unit of replication.
5. **The sides share nothing but the machine.** Each side gets its own
   instance of the runtime bundle, of the workload module and of the timing
   loop (distinct module URLs, per-side compiled loop source). A shared loop
   would see two `step` targets, go polymorphic and stop inlining, which
   slowed a 2 ns read to 4 ns and produced 12% bimodal artefacts before it
   was isolated.
6. **Position is balanced, not randomized.** The build loaded first into a
   process runs systematically faster or slower than the second (1–3% on
   the CI calibration, with a workload-dependent sign). Randomizing the
   order removes the bias but leaves bimodal noise, so every comparison runs
   in both orientations and the replicate's estimate is their mean, which
   cancels the effect exactly. The effect is reported per workload.
7. **JIT outcomes are made deterministic.** V8 optimizes on a background
   thread, so the feedback a function is compiled with depends on thread
   timing, and one workload lands in two or three code shapes across
   processes: ±10% modes on fan-out/fan-in, occasional 2× outliers on
   single-edge workloads in the first CI calibration. Comparison workers
   run with `--predictable` (synchronous compilation, single-threaded GC),
   which collapsed a local A/A spread of ±13% to ±1.8%. Steady-state code
   is still TurboFan output; `--no-predictable` measures the default
   concurrent configuration when compilation behavior itself is the subject.
8. **Placement is randomized, not fixed.** Determinism has a cost: under
   `--predictable` a given build gets the same code and heap placement in
   every process, so a placement effect of that build (alignment of a hot
   loop, cache-set conflicts) is a fixed bias, and replication narrows the
   interval around it instead of averaging it. Two builds with identical
   machine code for `A.track.reorder-8` measured +4.7% [3.8, 5.6] apart on
   the CI runner, and the A-vs-A' control cannot see this, since it repeats
   one build. Each pair process therefore gets a `--layout-seed`: before
   loading each side, and again before tiering each side up alone, the
   worker compiles a random amount of throwaway optimized code and retains
   a random amount of heap, so each side's hot code and data land at an
   independent random offset. Placement effects become variance of the
   replicates and widen the interval honestly. `--no-layout` restores the
   fixed placement for comparison with earlier runs.
9. **Every comparison carries its own negative control.** Each replicate runs
   A-vs-B and A-vs-A' (baseline against itself), both in both orientations.
   If the control detects a difference, the method is biased for that
   workload and the comparison is invalid.
10. **No single score.** Results are reported per workload and level; a
   regression in one class is never averaged away by gains elsewhere.

## Workload levels

| Level                   | Purpose                                            | Examples                                                                                                                                                                                        |
| ----------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — kernel primitives   | Constant cost of one primitive on a prepared graph | untracked producer read, write without subscribers, rejected equal write, clean computed read, tracked re-read with stable order, reordered tracking, watcher rerun, watcher create/run/dispose |
| B — structure           | How cost scales with shape                         | chain depth 10/100/1000, fan-out and fan-in width 10/100/1000, layered diamonds, equality cutoff chain                                                                                          |
| C — execution           | Interaction of mechanisms                          | batched writes with one settlement, A→B→A context switch, invalidation wave over 256 watchers, lazy selectivity (12 of 256 read)                                                                |
| D — application-like    | Realistic mixes                                    | filtered/selected list with per-row derivations and watchers, subtree mount/update/unmount churn                                                                                                |
| E — complexity & memory | Scaling and retention                              | B-level sweeps read as slopes (ns per level/edge), retained bytes per mount/unmount cycle after full GC                                                                                         |

Interpretation is per op: `ns/op = ns/step ÷ opsPerStep`, where an op is the
unit named in the workload (a read, a level, a dependency, a watcher). B-level
families are compared as slopes across sizes, not as single numbers.

## Measurement procedure (worker)

`bench/worker.mjs <X> <id> pair <Y>` is the comparison mode:

1. Load each side's bundle and workload module as private instances; `setup`
   builds both graphs outside the measured region and stabilizes them. With
   `--layout-seed`, each load is preceded by a random shift of code and heap.
2. With `--layout-seed`, tier each side up alone for 300 ms, each behind its
   own independent random shift, so the sides' hot code is placed independently.
3. Calibrate one batch size so a sample of either side takes about 2 ms.
4. Warm up both sides alternately, 300 ms each (past V8's optimizing tiers).
5. Three forced GCs, then `samples` pairs in an X Y / Y X alternating order;
   each pair yields `log(tY/tX)`. GC events during sampling are recorded.
6. Results are folded into a sink returned by the process, so the work cannot
   be eliminated.

`time` mode runs the same loop for one side and is used for absolute
numbers and profiling, never for A/B claims.

Memory workloads run `200` warm-up steps, three forced GCs, `N` steps and three
forced GCs again, reporting `Δheap / N`. A single `Δheap / N` mixes one-time
costs (JIT metadata, cache growth) with retention: identical bundles read 36
and 42 B/step on the CI calibration. Retention is therefore the slope between
`N = 2000` and `N = 8000` in separate processes, median of 5 runs per side;
one-time costs cancel and only memory that grows with cycles remains.

## Comparison procedure (compare)

1. Build both sides; record commits, flags, bundle SHA-256, Node/V8, CPU.
2. Verify every workload on both sides.
3. Shuffle `workload × replicate` blocks; inside each block run four
   processes in random order (seeded; the seed is recorded): A-vs-B and
   A-vs-A', each with A loaded first and with A loaded second.
4. Each process contributes the median of its pair log ratios, oriented as
   `log(other/A)`; a replicate's estimate is the mean of its two
   orientations.
5. Report the median ratio and the exact order-statistic 95% interval of the
   median with a Bonferroni correction over the workload family
   (`tooling/benchmarks/statistics.mjs`).

Replicates set the interval's robustness. With a family of 25 the interval
is the sample minimum..maximum at 12 replicates (one outlier process sets
it), ranks 2..17 at 20 and ranks 4..19 at 24. Qualification uses 24.

### Verdicts

`t` is the practical threshold declared before the run (default 3%). It is
the smallest change worth acting on, not a noise estimate; a workload whose
A/A interval is wider than `±t` simply cannot reach `equivalent` (see
`BENCHMARK_CALIBRATION.md` for each workload's resolution).

| Verdict        | Condition                                                                     |
| -------------- | ----------------------------------------------------------------------------- |
| `invalid`      | verification differs, or the A'/A control interval excludes zero              |
| `screening`    | too few replicates for a finite simultaneous interval (< 11 for 25 workloads) |
| `faster`       | whole interval below `−t`                                                     |
| `slower`       | whole interval above `+t`                                                     |
| `equivalent`   | whole interval inside `[−t, +t]`                                              |
| `inconclusive` | interval crosses `±t`                                                         |

A claim of speedup requires `faster` on a controlled runner. `screening` and
`inconclusive` never support a claim in either direction.

## Noise calibration

An A/A run (candidate = baseline sources) qualifies the protocol itself: no
workload may be judged `faster`, `slower` or `invalid`. Its per-workload
interval half-width is the resolution of that workload on that runner: the
smallest effect the protocol can certify there. The calibration result for
the current runner is recorded in `BENCHMARK_CALIBRATION.md`.

## CI tiers

| Tier                      | Trigger                                              | Content                                                                                                                                | Gate                                                                                |
| ------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| PR fast                   | every PR                                             | oracle differential (2000 seeds × 2 levels), mutation qualification, branch coverage, `bench/compare.mjs --quick` on A-level workloads | semantic gates block; quick bench is screening only and never blocks                |
| Performance qualification | controlled runner, release candidates and kernel PRs | full workload set, 24 replicates, recorded seed                                                                                        | `slower` or `invalid` blocks; `inconclusive` requires a rerun or a written decision |
| Memory                    | same runner                                          | E-level workloads at two sizes                                                                                                         | growth that scales with cycles blocks                                               |

Results are written as JSON with provenance (`.cache/bench/*.json`); the PR
tier uploads them as artifacts rather than comparing against a stored
historical number, so hardware changes never masquerade as regressions.

The hosted workflow `.github/workflows/runtime-paired-benchmarks.yml` is the
screening tier on GitHub runners. In `compare` mode it measures a pull
request's base against its merge result, a push to main against the previous
head of main, or a chosen baseline against HEAD; in `calibrate` mode it
builds both sides from one commit (A/A). Both sides are always built from
commits, in balanced parallel shards (`bench/shards.mjs`). It runs `compare.mjs --fail-on none` and turns
the report into a job summary and annotations with `bench/ci-report.mjs`:
`slower`, `invalid` and `error` become warnings, `faster` a notice, and in
A/A any decisive verdict flags the method on that runner. The job fails only
when the harness produces no report. A worker that crashes or times out is
retried once; a second failure gives that workload the verdict `error`
instead of aborting the run. Locally, `compare.mjs` still exits 1 on
`slower`, `invalid` or `error` unless `--fail-on` says otherwise.
