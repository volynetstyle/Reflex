# Reflex competitor benchmark

Generated: 2026-09-22T11:52:25.246Z on v25.2.0 / 14.1.146.11-node.13

Medians are across fresh-process trials. `vs Reflex` is the median of same-trial throughput ratios; values below 1 are slower than Reflex. Ratios are withheld for failed or capability-incompatible runs.

| Scenario | Size | Framework | Trials | ops/s | MAD % | computed/op | effects/op | p99 ns | p999 ns | vs Reflex | Status |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| equal-leaf | 1 | Reflex working tree | 5/5 | 109396037 | 0.96 | 0.00 | 0.00 | 200 | n/a | 1.000 | comparable |
| equal-leaf | 1 | Reflex e87bb66 | 5/5 | 107990560 | 1.62 | 0.00 | 0.00 | 200 | n/a | 0.987 | comparable |
| equal-leaf | 1 | alien-signals 3.2.1 | 5/5 | 190503816 | 0.53 | 0.00 | 0.00 | 200 | n/a | 1.729 | comparable |
| equal-leaf | 1 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 77008518 | 0.35 | 0.00 | 0.00 | 200 | n/a | 0.704 | comparable |
| equal-leaf | 1 | @vue/reactivity 3.5.43 | 5/5 | 569690656 | 0.44 | 0.00 | 0.00 | 200 | n/a | 5.208 | comparable |

Cross-runtime final-checksum comparison was skipped for 5 adaptive trace group(s) with different operation counts. Every worker still passed its scenario model validation; trace lengths are retained in JSON.

Heap deltas and GC observations are diagnostics retained in JSON/CSV, not allocation measurements. Raw phase-separated work counters and failures are retained in JSON.
