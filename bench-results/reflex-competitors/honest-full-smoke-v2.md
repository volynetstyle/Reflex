# Reflex competitor benchmark

Generated: 2026-09-22T10:23:23.467Z on v25.2.0 / 14.1.146.11-node.13

**Smoke mode is a wiring check. Its throughput and latency samples are not performance evidence.**

Medians are across fresh-process trials. `vs Reflex` is the median of same-trial throughput ratios; values below 1 are slower than Reflex. Ratios are withheld for failed or capability-incompatible runs.

| Scenario | Size | Framework | Trials | ops/s | MAD % | computed/op | effects/op | p99 ns | p999 ns | vs Reflex | Status |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| changed-chain | 16 | Reflex working tree | 1/1 | 74102 | n/a | 16.00 | 1.00 | n/a | n/a | n/a | smoke only |
| changed-chain | 16 | Reflex e87bb66 | 1/1 | 75930 | n/a | 16.00 | 1.00 | n/a | n/a | n/a | smoke only |
| changed-chain | 16 | alien-signals 3.2.1 | 1/1 | 82713 | n/a | 16.00 | 1.00 | n/a | n/a | n/a | smoke only |
| changed-chain | 16 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 28986 | n/a | 16.00 | 1.00 | n/a | n/a | n/a | smoke only |
| changed-chain | 16 | @vue/reactivity 3.5.43 | 1/1 | 25743 | n/a | 16.00 | 1.00 | n/a | n/a | n/a | smoke only |
| changed-leaf | 1 | Reflex working tree | 1/1 | 184162 | n/a | 0.00 | 1.00 | n/a | n/a | n/a | smoke only |
| changed-leaf | 1 | Reflex e87bb66 | 1/1 | 161031 | n/a | 0.00 | 1.00 | n/a | n/a | n/a | smoke only |
| changed-leaf | 1 | alien-signals 3.2.1 | 1/1 | 246305 | n/a | 0.00 | 1.00 | n/a | n/a | n/a | smoke only |
| changed-leaf | 1 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 79083 | n/a | 0.00 | 1.00 | n/a | n/a | n/a | smoke only |
| changed-leaf | 1 | @vue/reactivity 3.5.43 | 1/1 | 234742 | n/a | 0.00 | 1.00 | n/a | n/a | n/a | smoke only |
| clean-edge | 16 | Reflex working tree | 1/1 | 1785714 | n/a | 0.00 | 0.00 | n/a | n/a | n/a | smoke only |
| clean-edge | 16 | Reflex e87bb66 | 1/1 | 2105263 | n/a | 0.00 | 0.00 | n/a | n/a | n/a | smoke only |
| clean-edge | 16 | alien-signals 3.2.1 | 1/1 | 2040816 | n/a | 0.00 | 0.00 | n/a | n/a | n/a | smoke only |
| clean-edge | 16 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 1092896 | n/a | 0.00 | 0.00 | n/a | n/a | n/a | smoke only |
| clean-edge | 16 | @vue/reactivity 3.5.43 | 1/1 | 1449275 | n/a | 0.00 | 0.00 | n/a | n/a | n/a | smoke only |
| deep-unknown | 16 | Reflex working tree | 1/1 | 119332 | n/a | 1.00 | 0.00 | n/a | n/a | n/a | smoke only |
| deep-unknown | 16 | Reflex e87bb66 | 1/1 | 130463 | n/a | 1.00 | 0.00 | n/a | n/a | n/a | smoke only |
| deep-unknown | 16 | alien-signals 3.2.1 | 1/1 | 144300 | n/a | 1.00 | 0.00 | n/a | n/a | n/a | smoke only |
| deep-unknown | 16 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 128700 | n/a | 1.00 | 0.00 | n/a | n/a | n/a | smoke only |
| deep-unknown | 16 | @vue/reactivity 3.5.43 | 1/1 | 87527 | n/a | 1.00 | 0.00 | n/a | n/a | n/a | smoke only |
| diamond-fan-in | 16 | Reflex working tree | 1/1 | 56561 | n/a | 17.00 | 1.00 | n/a | n/a | n/a | smoke only |
| diamond-fan-in | 16 | Reflex e87bb66 | 1/1 | 62794 | n/a | 17.00 | 1.00 | n/a | n/a | n/a | smoke only |
| diamond-fan-in | 16 | alien-signals 3.2.1 | 1/1 | 88106 | n/a | 17.00 | 1.00 | n/a | n/a | n/a | smoke only |
| diamond-fan-in | 16 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 23719 | n/a | 17.00 | 1.00 | n/a | n/a | n/a | smoke only |
| diamond-fan-in | 16 | @vue/reactivity 3.5.43 | 1/1 | 51361 | n/a | 17.00 | 1.00 | n/a | n/a | n/a | smoke only |
| dynamic-branch | 16 | Reflex working tree | 1/1 | 106440 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| dynamic-branch | 16 | Reflex e87bb66 | 1/1 | 25465 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| dynamic-branch | 16 | alien-signals 3.2.1 | 1/1 | 161812 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| dynamic-branch | 16 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 52029 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| dynamic-branch | 16 | @vue/reactivity 3.5.43 | 1/1 | 143369 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| effect-fanout | 16 | Reflex working tree | 1/1 | 22686 | n/a | 1.00 | 16.00 | n/a | n/a | n/a | smoke only |
| effect-fanout | 16 | Reflex e87bb66 | 1/1 | 55850 | n/a | 1.00 | 16.00 | n/a | n/a | n/a | smoke only |
| effect-fanout | 16 | alien-signals 3.2.1 | 1/1 | 98668 | n/a | 1.00 | 16.00 | n/a | n/a | n/a | smoke only |
| effect-fanout | 16 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 30586 | n/a | 1.00 | 16.00 | n/a | n/a | n/a | smoke only |
| effect-fanout | 16 | @vue/reactivity 3.5.43 | 1/1 | 76599 | n/a | 1.00 | 16.00 | n/a | n/a | n/a | smoke only |
| equal-leaf | 1 | Reflex working tree | 1/1 | 431965 | n/a | 0.00 | 0.00 | n/a | n/a | n/a | smoke only |
| equal-leaf | 1 | Reflex e87bb66 | 1/1 | 483092 | n/a | 0.00 | 0.00 | n/a | n/a | n/a | smoke only |
| equal-leaf | 1 | alien-signals 3.2.1 | 1/1 | 781250 | n/a | 0.00 | 0.00 | n/a | n/a | n/a | smoke only |
| equal-leaf | 1 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 613497 | n/a | 0.00 | 0.00 | n/a | n/a | n/a | smoke only |
| equal-leaf | 1 | @vue/reactivity 3.5.43 | 1/1 | 625000 | n/a | 0.00 | 0.00 | n/a | n/a | n/a | smoke only |
| failure-retry | 16 | Reflex working tree | 1/1 | 53177 | n/a | 17.00 | 0.00 | n/a | n/a | n/a | smoke only |
| failure-retry | 16 | Reflex e87bb66 | 1/1 | 53923 | n/a | 17.00 | 0.00 | n/a | n/a | n/a | smoke only |
| failure-retry | 16 | alien-signals 3.2.1 | 1/1 | 59595 | n/a | 17.00 | 0.00 | n/a | n/a | n/a | smoke only |
| failure-retry | 16 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 10655 | n/a | 17.00 | 0.00 | n/a | n/a | n/a | smoke only |
| failure-retry | 16 | @vue/reactivity 3.5.43 | 1/1 | 39992 | n/a | 17.00 | 0.00 | n/a | n/a | n/a | smoke only |
| layered-dag | 8 | Reflex working tree | 1/1 | 27027 | n/a | 65.00 | 1.00 | n/a | n/a | n/a | smoke only |
| layered-dag | 8 | Reflex e87bb66 | 1/1 | 29425 | n/a | 65.00 | 1.00 | n/a | n/a | n/a | smoke only |
| layered-dag | 8 | alien-signals 3.2.1 | 1/1 | 34124 | n/a | 65.00 | 1.00 | n/a | n/a | n/a | smoke only |
| layered-dag | 8 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 8879 | n/a | 65.00 | 1.00 | n/a | n/a | n/a | smoke only |
| layered-dag | 8 | @vue/reactivity 3.5.43 | 1/1 | 20916 | n/a | 65.00 | 1.00 | n/a | n/a | n/a | smoke only |
| lifecycle-churn | 16 | Reflex working tree | 1/1 | 29061 | n/a | 0.00 | 32.00 | n/a | n/a | n/a | smoke only |
| lifecycle-churn | 16 | Reflex e87bb66 | 1/1 | 30727 | n/a | 0.00 | 32.00 | n/a | n/a | n/a | smoke only |
| lifecycle-churn | 16 | alien-signals 3.2.1 | 1/1 | 44713 | n/a | 0.00 | 32.00 | n/a | n/a | n/a | smoke only |
| lifecycle-churn | 16 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 11625 | n/a | 0.00 | 32.00 | n/a | n/a | n/a | smoke only |
| lifecycle-churn | 16 | @vue/reactivity 3.5.43 | 1/1 | 30349 | n/a | 0.00 | 32.00 | n/a | n/a | n/a | smoke only |
| mostly-dirty | 256 | Reflex working tree | 1/1 | 20159 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| mostly-dirty | 256 | Reflex e87bb66 | 1/1 | 18676 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| mostly-dirty | 256 | alien-signals 3.2.1 | 1/1 | 27782 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| mostly-dirty | 256 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 15365 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| mostly-dirty | 256 | @vue/reactivity 3.5.43 | 1/1 | 919 | n/a | 192.00 | 192.00 | n/a | n/a | n/a | smoke only; not comparable: Scenario requires publicBatch for equal public observable work |
| reorder-dependencies | 64 | Reflex working tree | 1/1 | 46458 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| reorder-dependencies | 64 | Reflex e87bb66 | 1/1 | 42535 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| reorder-dependencies | 64 | alien-signals 3.2.1 | 1/1 | 41331 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| reorder-dependencies | 64 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 24938 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| reorder-dependencies | 64 | @vue/reactivity 3.5.43 | 1/1 | 43611 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| selective-update | 256 | Reflex working tree | 1/1 | 55509 | n/a | 2.00 | 1.00 | n/a | n/a | n/a | smoke only |
| selective-update | 256 | Reflex e87bb66 | 1/1 | 47630 | n/a | 2.00 | 1.00 | n/a | n/a | n/a | smoke only |
| selective-update | 256 | alien-signals 3.2.1 | 1/1 | 41195 | n/a | 2.00 | 1.00 | n/a | n/a | n/a | smoke only |
| selective-update | 256 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 13916 | n/a | 2.00 | 1.00 | n/a | n/a | n/a | smoke only |
| selective-update | 256 | @vue/reactivity 3.5.43 | 1/1 | 23674 | n/a | 2.00 | 1.00 | n/a | n/a | n/a | smoke only |
| semantic-noop-fanout | 16 | Reflex working tree | 1/1 | 79840 | n/a | 16.00 | 0.00 | n/a | n/a | n/a | smoke only |
| semantic-noop-fanout | 16 | Reflex e87bb66 | 1/1 | 74850 | n/a | 16.00 | 0.00 | n/a | n/a | n/a | smoke only |
| semantic-noop-fanout | 16 | alien-signals 3.2.1 | 1/1 | 100100 | n/a | 16.00 | 0.00 | n/a | n/a | n/a | smoke only |
| semantic-noop-fanout | 16 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 25723 | n/a | 16.00 | 0.00 | n/a | n/a | n/a | smoke only |
| semantic-noop-fanout | 16 | @vue/reactivity 3.5.43 | 1/1 | 59506 | n/a | 16.00 | 0.00 | n/a | n/a | n/a | smoke only |
| task-board | 256 | Reflex working tree | 1/1 | 56625 | n/a | 1.65 | 0.65 | n/a | n/a | n/a | smoke only |
| task-board | 256 | Reflex e87bb66 | 1/1 | 14273 | n/a | 1.65 | 0.65 | n/a | n/a | n/a | smoke only |
| task-board | 256 | alien-signals 3.2.1 | 1/1 | 51151 | n/a | 1.65 | 0.65 | n/a | n/a | n/a | smoke only |
| task-board | 256 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 18742 | n/a | 1.65 | 0.65 | n/a | n/a | n/a | smoke only |
| task-board | 256 | @vue/reactivity 3.5.43 | 1/1 | 16724 | n/a | 2.35 | 1.00 | n/a | n/a | n/a | smoke only; not comparable: Scenario requires publicBatch for equal public observable work |
| wide-fanout | 16 | Reflex working tree | 1/1 | 44954 | n/a | 16.00 | 16.00 | n/a | n/a | n/a | smoke only |
| wide-fanout | 16 | Reflex e87bb66 | 1/1 | 41745 | n/a | 16.00 | 16.00 | n/a | n/a | n/a | smoke only |
| wide-fanout | 16 | alien-signals 3.2.1 | 1/1 | 73073 | n/a | 16.00 | 16.00 | n/a | n/a | n/a | smoke only |
| wide-fanout | 16 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 17504 | n/a | 16.00 | 16.00 | n/a | n/a | n/a | smoke only |
| wide-fanout | 16 | @vue/reactivity 3.5.43 | 1/1 | 45157 | n/a | 16.00 | 16.00 | n/a | n/a | n/a | smoke only |
| window-dependency-churn | 16 | Reflex working tree | 1/1 | 107181 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| window-dependency-churn | 16 | Reflex e87bb66 | 1/1 | 96386 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| window-dependency-churn | 16 | alien-signals 3.2.1 | 1/1 | 165426 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| window-dependency-churn | 16 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 49838 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| window-dependency-churn | 16 | @vue/reactivity 3.5.43 | 1/1 | 100756 | n/a | 2.00 | 2.00 | n/a | n/a | n/a | smoke only; not comparable: Scenario requires publicBatch for equal public observable work |

Heap deltas and GC observations are diagnostics retained in JSON/CSV, not allocation measurements. Raw phase-separated work counters and failures are retained in JSON.
