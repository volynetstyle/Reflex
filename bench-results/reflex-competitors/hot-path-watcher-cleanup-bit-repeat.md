# Reflex competitor benchmark

Generated: 2026-09-22T17:19:21.910Z on v25.2.0 / 14.1.146.11-node.13

Medians are across fresh-process trials. `vs Reflex` is the median of same-trial throughput ratios; values below 1 are slower than Reflex. Ratios are withheld for failed or capability-incompatible runs.

| Scenario | Size | Framework | Trials | ops/s | MAD % | computed/op | effects/op | p99 ns | p999 ns | vs Reflex | Status |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| effect-fanout | 8 | Reflex working tree | 7/7 | 3859442 | 2.79 | 1.00 | 8.00 | 600 | n/a | 1.000 | comparable |
| effect-fanout | 16 | Reflex working tree | 7/7 | 2178875 | 1.12 | 1.00 | 16.00 | 800 | n/a | 1.000 | comparable |
| effect-fanout | 32 | Reflex working tree | 7/7 | 1112071 | 0.86 | 1.00 | 32.00 | 1300 | n/a | 1.000 | comparable |
| effect-fanout | 64 | Reflex working tree | 7/7 | 575257 | 0.59 | 1.00 | 64.00 | 2500 | n/a | 1.000 | comparable |

Heap deltas and GC observations are diagnostics retained in JSON/CSV, not allocation measurements. Raw phase-separated work counters and failures are retained in JSON.
