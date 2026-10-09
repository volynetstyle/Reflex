# Reflex competitor benchmark

Generated: 2026-09-22T12:25:48.943Z on v25.2.0 / 14.1.146.11-node.13

**Smoke mode is a wiring check. Its throughput and latency samples are not performance evidence.**

Medians are across fresh-process trials. `vs Reflex` is the median of same-trial throughput ratios; values below 1 are slower than Reflex. Ratios are withheld for failed or capability-incompatible runs.

| Scenario | Size | Framework | Trials | ops/s | MAD % | computed/op | effects/op | p99 ns | p999 ns | vs Reflex | Status |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| changed-result | 1 | Reflex working tree | 1/1 | 140252 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| changed-result | 1 | Reflex e87bb66 | 1/1 | 137646 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| changed-result | 1 | alien-signals 3.2.1 | 1/1 | 201410 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| changed-result | 1 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 77912 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| changed-result | 1 | @vue/reactivity 3.5.43 | 1/1 | 175131 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| equal-leaf | 1 | Reflex working tree | 1/1 | 420168 | n/a | 0.00 | 0.00 | n/a | n/a | n/a | smoke only |
| equal-leaf | 1 | Reflex e87bb66 | 1/1 | 356506 | n/a | 0.00 | 0.00 | n/a | n/a | n/a | smoke only |
| equal-leaf | 1 | alien-signals 3.2.1 | 1/1 | 784314 | n/a | 0.00 | 0.00 | n/a | n/a | n/a | smoke only |
| equal-leaf | 1 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 615385 | n/a | 0.00 | 0.00 | n/a | n/a | n/a | smoke only |
| equal-leaf | 1 | @vue/reactivity 3.5.43 | 1/1 | 564972 | n/a | 0.00 | 0.00 | n/a | n/a | n/a | smoke only |
| equal-result | 1 | Reflex working tree | 1/1 | 163132 | n/a | 1.00 | 0.00 | n/a | n/a | n/a | smoke only |
| equal-result | 1 | Reflex e87bb66 | 1/1 | 161031 | n/a | 1.00 | 0.00 | n/a | n/a | n/a | smoke only |
| equal-result | 1 | alien-signals 3.2.1 | 1/1 | 228050 | n/a | 1.00 | 0.00 | n/a | n/a | n/a | smoke only |
| equal-result | 1 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 98377 | n/a | 1.00 | 0.00 | n/a | n/a | n/a | smoke only |
| equal-result | 1 | @vue/reactivity 3.5.43 | 1/1 | 182983 | n/a | 1.00 | 0.00 | n/a | n/a | n/a | smoke only |

Heap deltas and GC observations are diagnostics retained in JSON/CSV, not allocation measurements. Raw phase-separated work counters and failures are retained in JSON.
