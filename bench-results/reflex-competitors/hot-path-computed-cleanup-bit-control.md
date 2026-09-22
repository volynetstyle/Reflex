# Reflex competitor benchmark

Generated: 2026-09-22T17:17:11.861Z on v25.2.0 / 14.1.146.11-node.13

Medians are across fresh-process trials. `vs Reflex` is the median of same-trial throughput ratios; values below 1 are slower than Reflex. Ratios are withheld for failed or capability-incompatible runs.

| Scenario | Size | Framework | Trials | ops/s | MAD % | computed/op | effects/op | p99 ns | p999 ns | vs Reflex | Status |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| changed-result | 1 | Reflex working tree | 7/7 | 19249358 | 1.11 | 1.00 | 1.00 | 300 | n/a | 1.000 | comparable |
| equal-result | 1 | Reflex working tree | 7/7 | 23230845 | 1.21 | 1.00 | 0.00 | 300 | n/a | 1.000 | comparable |

Heap deltas and GC observations are diagnostics retained in JSON/CSV, not allocation measurements. Raw phase-separated work counters and failures are retained in JSON.
