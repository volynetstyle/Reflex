# Outgoing finger: measured data

See `packages/reflex-runtime/perf/outgoing-finger/README.md`. Base `14e8fdb`,
Windows laptop (i5-1235U), Node 24.22 for timing, Node 25 for PROFILE link
counts (deterministic).

| file                                                       | what                                                                 |
| ---------------------------------------------------------- | -------------------------------------------------------------------- |
| `matrix-128*.json`, `matrix-ring.json`                     | links: first variant family (next … ring, rotate)                    |
| `matrix-hedge.json`, `matrix-headr.json`                   | links: adversarial schedules, ring-head, ring-r2, head-rR            |
| `matrix-budget.json`, `matrix-mix.json`, `saturation.json` | links: lock-bB, mix-bB, budget sweep                                 |
| `ladder-bench.json`, `mix-ladder.json`                     | links on every ladder rung and bench workload                        |
| `lab-links.json`                                           | links on the end-to-end lab mirror                                   |
| `mig-base.json`, `mig-cand.json`                           | route migration, base vs the source candidate (mix-b8)               |
| `time-1.json`                                              | timing: ring, zigzag, bidir, cyclic                                  |
| `time-2.json`                                              | timing: head-r2, ring-head, head-r3                                  |
| `time-3{a,b,c}.json`                                       | timing: head-r2, lock-b8, mix-b8, ring-head (c: lab mirror)          |
| `compare-ring-candidate-quick.json`                        | bench/compare.mjs --quick, the earlier ring candidate (14 workloads) |
| `compare-mix-quick.json`                                   | bench/compare.mjs --quick, mix-b8 (all timed workloads)              |
| `fuzz-mix.txt`, `qualify-mix.txt`                          | graph fuzz and mutant qualification of mix-b8                        |
| `shape-base.json`, `shape-mix-b8.json`                     | perf/v8-shape: TurboFan per-function shape, all timed workloads      |

JSON is stored minified; `node -e 'console.log(JSON.stringify(require("./file.json"), null, 2))'` restores the layout.
