# Reflex competitor benchmark

Generated: 2026-09-22T12:34:35.431Z on v25.2.0 / 14.1.146.11-node.13

Medians are across fresh-process trials. `vs Reflex` is the median of same-trial throughput ratios; values below 1 are slower than Reflex. Ratios are withheld for failed or capability-incompatible runs.

| Scenario | Size | Framework | Trials | ops/s | MAD % | computed/op | effects/op | p99 ns | p999 ns | vs Reflex | Status |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| equal-leaf | 1 | Reflex working tree | 5/5 | 104079142 | 2.57 | 0.00 | 0.00 | 200 | n/a | 1.000 | comparable |
| equal-leaf | 1 | Reflex e87bb66 | 5/5 | 106723087 | 1.52 | 0.00 | 0.00 | 200 | n/a | 1.003 | comparable |
| equal-leaf | 1 | alien-signals 3.2.1 | 5/5 | 179017671 | 0.72 | 0.00 | 0.00 | 200 | n/a | 1.712 | comparable |
| equal-leaf | 1 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 57345083 | 20.03 | 0.00 | 0.00 | 300 | n/a | 0.672 | comparable |
| equal-leaf | 1 | @vue/reactivity 3.5.43 | 5/5 | 548765140 | 0.68 | 0.00 | 0.00 | 200 | n/a | 5.185 | comparable |
| equal-write-direct | 1 | Reflex working tree | 5/5 | 405120020 | 4.36 | 0.00 | 0.00 | 200 | n/a | 1.000 | comparable |
| equal-write-direct | 1 | Reflex e87bb66 | 5/5 | 417962100 | 0.79 | 0.00 | 0.00 | 200 | n/a | 1.016 | comparable |
| equal-write-direct | 1 | alien-signals 3.2.1 | 5/5 | 464756980 | 1.74 | 0.00 | 0.00 | 200 | n/a | 1.112 | comparable |
| equal-write-direct | 1 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 340505620 | 5.05 | 0.00 | 0.00 | 200 | n/a | 0.843 | comparable |
| equal-write-direct | 1 | @vue/reactivity 3.5.43 | 5/5 | 561539860 | 0.36 | 0.00 | 0.00 | 200 | n/a | 1.333 | comparable |

Cross-runtime final-checksum comparison was skipped for 10 adaptive trace group(s) with different operation counts. Every worker still passed its scenario model validation; trace lengths are retained in JSON.

Heap deltas and GC observations are diagnostics retained in JSON/CSV, not allocation measurements. Raw phase-separated work counters and failures are retained in JSON.
