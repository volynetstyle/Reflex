# Reflex competitor benchmark

Generated: 2026-09-22T10:16:48.792Z on v25.2.0 / 14.1.146.11-node.13

**Smoke mode is a wiring check. Its throughput and latency samples are not performance evidence.**

Medians are across fresh-process trials. `vs Reflex` is the median of same-trial throughput ratios; values below 1 are slower than Reflex. Ratios are withheld for failed or capability-incompatible runs.

| Scenario | Size | Framework | Trials | ops/s | MAD % | computed/op | effects/op | p99 ns | p999 ns | vs Reflex | Status |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| changed-leaf | 1 | Reflex working tree | 1/1 | 173310 | n/a | 0.00 | 1.00 | n/a | n/a | n/a | smoke only |
| changed-leaf | 1 | Reflex e87bb66 | 1/1 | 171674 | n/a | 0.00 | 1.00 | n/a | n/a | n/a | smoke only |
| changed-leaf | 1 | alien-signals 3.2.1 | 1/1 | 83507 | n/a | 0.00 | 1.00 | n/a | n/a | n/a | smoke only |
| changed-leaf | 1 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 88300 | n/a | 0.00 | 1.00 | n/a | n/a | n/a | smoke only |
| changed-leaf | 1 | @vue/reactivity 3.5.43 | 1/1 | 222222 | n/a | 0.00 | 1.00 | n/a | n/a | n/a | smoke only |
| diamond-fan-in | 16 | Reflex working tree | 1/1 | 62480 | n/a | 17.00 | 1.00 | n/a | n/a | n/a | smoke only |
| diamond-fan-in | 16 | Reflex e87bb66 | 1/1 | 60716 | n/a | 17.00 | 1.00 | n/a | n/a | n/a | smoke only |
| diamond-fan-in | 16 | alien-signals 3.2.1 | 1/1 | 66159 | n/a | 17.00 | 1.00 | n/a | n/a | n/a | smoke only |
| diamond-fan-in | 16 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 11192 | n/a | 17.00 | 1.00 | n/a | n/a | n/a | smoke only |
| diamond-fan-in | 16 | @vue/reactivity 3.5.43 | 1/1 | 40096 | n/a | 17.00 | 1.00 | n/a | n/a | n/a | smoke only |
| layered-dag | 8 | Reflex working tree | 1/1 | 28918 | n/a | 65.00 | 1.00 | n/a | n/a | n/a | smoke only |
| layered-dag | 8 | Reflex e87bb66 | 1/1 | 28588 | n/a | 65.00 | 1.00 | n/a | n/a | n/a | smoke only |
| layered-dag | 8 | alien-signals 3.2.1 | 1/1 | 27031 | n/a | 65.00 | 1.00 | n/a | n/a | n/a | smoke only |
| layered-dag | 8 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 5646 | n/a | 65.00 | 1.00 | n/a | n/a | n/a | smoke only |
| layered-dag | 8 | @vue/reactivity 3.5.43 | 1/1 | 19608 | n/a | 65.00 | 1.00 | n/a | n/a | n/a | smoke only |
| lifecycle-churn | 16 | Reflex working tree | 1/1 | 30198 | n/a | 0.00 | 32.00 | n/a | n/a | n/a | smoke only |
| lifecycle-churn | 16 | Reflex e87bb66 | 1/1 | 29652 | n/a | 0.00 | 32.00 | n/a | n/a | n/a | smoke only |
| lifecycle-churn | 16 | alien-signals 3.2.1 | 1/1 | 48333 | n/a | 0.00 | 32.00 | n/a | n/a | n/a | smoke only |
| lifecycle-churn | 16 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 11320 | n/a | 0.00 | 32.00 | n/a | n/a | n/a | smoke only |
| lifecycle-churn | 16 | @vue/reactivity 3.5.43 | 1/1 | 31216 | n/a | 0.00 | 32.00 | n/a | n/a | n/a | smoke only |
| mostly-dirty | 256 | Reflex working tree | 1/1 | 22082 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| mostly-dirty | 256 | Reflex e87bb66 | 1/1 | 18381 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| mostly-dirty | 256 | alien-signals 3.2.1 | 1/1 | 26298 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| mostly-dirty | 256 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 9035 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| mostly-dirty | 256 | @vue/reactivity 3.5.43 | 1/1 | 966 | n/a | 192.00 | 192.00 | n/a | n/a | n/a | smoke only; not comparable: Scenario requires publicBatch for equal public observable work |
| task-board | 256 | Reflex working tree | 1/1 | 49188 | n/a | 1.65 | 0.65 | n/a | n/a | n/a | smoke only |
| task-board | 256 | Reflex e87bb66 | 1/1 | 51414 | n/a | 1.65 | 0.65 | n/a | n/a | n/a | smoke only |
| task-board | 256 | alien-signals 3.2.1 | 1/1 | 23527 | n/a | 1.65 | 0.65 | n/a | n/a | n/a | smoke only |
| task-board | 256 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 19146 | n/a | 1.65 | 0.65 | n/a | n/a | n/a | smoke only |
| task-board | 256 | @vue/reactivity 3.5.43 | 1/1 | 29218 | n/a | 2.35 | 1.00 | n/a | n/a | n/a | smoke only; not comparable: Scenario requires publicBatch for equal public observable work |
| wide-fanout | 16 | Reflex working tree | 1/1 | 25631 | n/a | 16.00 | 16.00 | n/a | n/a | n/a | smoke only |
| wide-fanout | 16 | Reflex e87bb66 | 1/1 | 42203 | n/a | 16.00 | 16.00 | n/a | n/a | n/a | smoke only |
| wide-fanout | 16 | alien-signals 3.2.1 | 1/1 | 73126 | n/a | 16.00 | 16.00 | n/a | n/a | n/a | smoke only |
| wide-fanout | 16 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 18450 | n/a | 16.00 | 16.00 | n/a | n/a | n/a | smoke only |
| wide-fanout | 16 | @vue/reactivity 3.5.43 | 1/1 | 44072 | n/a | 16.00 | 16.00 | n/a | n/a | n/a | smoke only |
| window-dependency-churn | 16 | Reflex working tree | 1/1 | 61050 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| window-dependency-churn | 16 | Reflex e87bb66 | 1/1 | 92851 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| window-dependency-churn | 16 | alien-signals 3.2.1 | 1/1 | 117371 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| window-dependency-churn | 16 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 46773 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| window-dependency-churn | 16 | @vue/reactivity 3.5.43 | 1/1 | 126904 | n/a | 2.00 | 2.00 | n/a | n/a | n/a | smoke only; not comparable: Scenario requires publicBatch for equal public observable work |

Heap deltas and GC observations are diagnostics retained in JSON/CSV, not allocation measurements. Raw phase-separated work counters and failures are retained in JSON.
