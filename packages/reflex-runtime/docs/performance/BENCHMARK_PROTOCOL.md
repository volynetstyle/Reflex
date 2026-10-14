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
6. **Every comparison carries its own negative control.** Each replicate runs
   one A-vs-B process and one A-vs-A' process (baseline against itself) in
   random order. If the control detects a difference, the method is biased
   for that workload and the comparison is invalid.
7. **No single score.** Results are reported per workload and level; a
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
   builds both graphs outside the measured region and stabilizes them.
2. Calibrate one batch size so a sample of either side takes about 2 ms.
3. Warm up both sides alternately, 300 ms each (past V8's optimizing tiers).
4. Three forced GCs, then `samples` pairs in an X Y / Y X alternating order;
   each pair yields `log(tY/tX)`. GC events during sampling are recorded.
5. Results are folded into a sink returned by the process, so the work cannot
   be eliminated.

`time` mode runs the same loop for one side and is used for absolute
numbers and profiling, never for A/B claims.

Memory workloads run `200` warm-up steps, three forced GCs, `N` steps and three
forced GCs again, reporting `Δheap / N`. Values are compared across sizes of `N`
before being read as retention; JIT metadata growth is not a leak.

## Comparison procedure (compare)

1. Build both sides; record commits, flags, bundle SHA-256, Node/V8, CPU.
2. Verify every workload on both sides.
3. Shuffle `workload × replicate` blocks; inside each block run the A-vs-B
   and A-vs-A' processes in random order, and randomize which build runs as
   X in each process (seeded; the seed is recorded).
4. Each process contributes the median of its pair log ratios, oriented as
   `log(other/A)`.
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
