# Reflex competitor benchmark

Generated: 2026-09-22T17:16:50.363Z on v25.2.0 / 14.1.146.11-node.13

Medians are across fresh-process trials. `vs Reflex` is the median of same-trial throughput ratios; values below 1 are slower than Reflex. Ratios are withheld for failed or capability-incompatible runs.

| Scenario | Size | Framework | Trials | ops/s | MAD % | computed/op | effects/op | p99 ns | p999 ns | vs Reflex | Status |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| effect-fanout | 8 | Reflex working tree | 7/7 | 4015585 | 1.02 | 1.00 | 8.00 | 600 | n/a | 1.000 | comparable |
| effect-fanout | 16 | Reflex working tree | 7/7 | 2238322 | 1.52 | 1.00 | 16.00 | 900 | n/a | 1.000 | comparable |
| effect-fanout | 32 | Reflex working tree | 7/7 | 1142778 | 0.89 | 1.00 | 32.00 | 1400 | n/a | 1.000 | comparable |
| effect-fanout | 64 | Reflex working tree | 7/7 | 607959 | 1.86 | 1.00 | 64.00 | 2700 | n/a | 1.000 | comparable |

Heap deltas and GC observations are diagnostics retained in JSON/CSV, not allocation measurements. Raw phase-separated work counters and failures are retained in JSON.
