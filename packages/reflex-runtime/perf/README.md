# Experiment tools

Harnesses for questions the paired benchmark suite does not answer. None is a
gate; verdicts go to [MODEL.md §7.2](../docs/MODEL.md#72-experiments-and-verdicts),
not into this tree. Timing runs on CI; link and event counts come from
PROFILE builds and are deterministic.

| Directory                          | Question                                                                         | Run (from `packages/reflex-runtime`)                           |
| ---------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `v8-shape/`                        | code size, inlining and deopts of hot functions                                  | `node perf/v8-shape/analyze.mjs` (also `pnpm check:jit-shape`) |
| `tracking-pair-lookup/`            | per lookup: `min(out, in)`, links compared, simulated slot hits                  | `node perf/tracking-pair-lookup/analyze.mjs`                   |
| `tracking-ladder/`                 | the degradation ladder, one property lost per rung; counterfactuals              | `node perf/tracking-ladder/analyze.mjs`, `time.mjs`            |
| `outgoing-finger/`                 | finger variants replayed lookup by lookup against a model of the code            | `node perf/outgoing-finger/analyze.mjs`, `time.mjs`            |
| `tape-controller/`                 | prepared-tape admission and finger schedule (CI: `research-tape-controller.yml`) | `bash perf/tape-controller/build.sh <set>`, then `time.mjs`    |
| `structural-retention/`            | oracle programs on two builds, classified by difference kind                     | `node perf/structural-retention/differential.mjs`              |
| `block-rotation/`                  | rotating the skipped suffix block instead of moving edges                        | `node perf/block-rotation/run.mjs`                             |
| `suffix-preservation/`             | linking past an empty `out(P)` without detaching the suffix                      | `node perf/suffix-preservation/run.mjs`                        |
| `node-allocation/`                 | retained bytes per node and per edge                                             | `node --expose-gc perf/node-allocation/run.mjs`                |
| `callback-memory/`                 | retained graphs of escaping callbacks                                            | `pnpm bench:runtime:memory`                                    |
| `domain-retention/`                | memory retained by execution domains                                             | `node --expose-gc perf/domain-retention/run.mjs`               |
| `cost-attribution/`                | structural events and time per kernel component                                  | `pnpm bench:cost-attribution`                                  |
| `../test/perf/work-amplification/` | work per write as graphs grow (its analyzer script is missing)                   | `pnpm bench:work-amplification:sweep`                          |
| `perf-tree/`                       | CPU profile of a tree workload                                                   | `pnpm perf:tree`                                               |
| `../test/perf/lifetime-churn/`     | ownership vs liveness under mount churn                                          | `pnpm bench:lifetime-churn`                                    |

Repository-level scripts: `scripts/compare-tracking-graph.mjs` (local A/B of
tracking scenarios), `scripts/tracking-lab-long-long.mjs` (the
ReactivePerformanceLab long × long mirror), `scripts/fuzz-tracking-graph.mjs`
(exactness).

A new experiment states its question and prediction before the run, compares
within one CI run, and leaves one row in MODEL.md when it ends.
