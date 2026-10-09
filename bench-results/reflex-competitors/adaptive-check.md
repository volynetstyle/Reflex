# Reflex competitor benchmark

Generated: 2026-09-22T10:21:45.930Z on v25.2.0 / 14.1.146.11-node.13

Medians are across fresh-process trials. `vs Reflex` is the median of same-trial throughput ratios; values below 1 are slower than Reflex. Ratios are withheld for failed or capability-incompatible runs.

| Scenario | Size | Framework | Trials | ops/s | MAD % | computed/op | effects/op | p99 ns | p999 ns | vs Reflex | Status |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| changed-leaf | 1 | Reflex working tree | 2/2 | 21052199 | 21.71 | 0.00 | 1.00 | 1100 | n/a | 1.000 | comparable |
| changed-leaf | 1 | Reflex e87bb66 | 2/2 | 27539254 | 4.22 | 0.00 | 1.00 | 300 | n/a | 1.385 | comparable |
| changed-leaf | 1 | alien-signals 3.2.1 | 2/2 | 29709490 | 2.56 | 0.00 | 1.00 | 500 | n/a | 1.473 | comparable |
| changed-leaf | 1 | @solidjs/signals 2.0.0-rc.9 | 2/2 | 3616525 | 2.54 | 0.00 | 1.00 | 750 | n/a | 0.181 | comparable |
| changed-leaf | 1 | @vue/reactivity 3.5.43 | 2/2 | 24394473 | 0.60 | 0.00 | 1.00 | 1200 | n/a | 1.214 | comparable |

Cross-runtime final-checksum comparison was skipped for 2 adaptive trace group(s) with different operation counts. Every worker still passed its scenario model validation; trace lengths are retained in JSON.

Heap deltas and GC observations are diagnostics retained in JSON/CSV, not allocation measurements. Raw phase-separated work counters and failures are retained in JSON.
