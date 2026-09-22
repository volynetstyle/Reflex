# Reflex competitor benchmark

Generated: 2026-09-22T10:18:54.382Z on v25.2.0 / 14.1.146.11-node.13

**Smoke mode is a wiring check. Its throughput and latency samples are not performance evidence.**

Medians are across fresh-process trials. `vs Reflex` is the median of same-trial throughput ratios; values below 1 are slower than Reflex. Ratios are withheld for failed or capability-incompatible runs.

| Scenario | Size | Framework | Trials | ops/s | MAD % | computed/op | effects/op | p99 ns | p999 ns | vs Reflex | Status |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| changed-chain | 16 | Reflex working tree | 1/1 | 66225 | n/a | 16.00 | 1.00 | n/a | n/a | n/a | smoke only |
| changed-chain | 16 | Reflex e87bb66 | 1/1 | 77489 | n/a | 16.00 | 1.00 | n/a | n/a | n/a | smoke only |
| changed-chain | 16 | alien-signals 3.2.1 | 1/1 | 85070 | n/a | 16.00 | 1.00 | n/a | n/a | n/a | smoke only |
| changed-chain | 16 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 28205 | n/a | 16.00 | 1.00 | n/a | n/a | n/a | smoke only |
| changed-chain | 16 | @vue/reactivity 3.5.43 | 1/1 | 61237 | n/a | 16.00 | 1.00 | n/a | n/a | n/a | smoke only |
| changed-leaf | 1 | Reflex working tree | 1/1 | 162470 | n/a | 0.00 | 1.00 | n/a | n/a | n/a | smoke only |
| changed-leaf | 1 | Reflex e87bb66 | 1/1 | 162470 | n/a | 0.00 | 1.00 | n/a | n/a | n/a | smoke only |
| changed-leaf | 1 | alien-signals 3.2.1 | 1/1 | 220751 | n/a | 0.00 | 1.00 | n/a | n/a | n/a | smoke only |
| changed-leaf | 1 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 87527 | n/a | 0.00 | 1.00 | n/a | n/a | n/a | smoke only |
| changed-leaf | 1 | @vue/reactivity 3.5.43 | 1/1 | 216450 | n/a | 0.00 | 1.00 | n/a | n/a | n/a | smoke only |
| clean-edge | 16 | Reflex working tree | 1/1 | 1190476 | n/a | 0.00 | 0.00 | n/a | n/a | n/a | smoke only |
| clean-edge | 16 | Reflex e87bb66 | 1/1 | 1886792 | n/a | 0.00 | 0.00 | n/a | n/a | n/a | smoke only |
| clean-edge | 16 | alien-signals 3.2.1 | 1/1 | 2000000 | n/a | 0.00 | 0.00 | n/a | n/a | n/a | smoke only |
| clean-edge | 16 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 1041667 | n/a | 0.00 | 0.00 | n/a | n/a | n/a | smoke only |
| clean-edge | 16 | @vue/reactivity 3.5.43 | 1/1 | 772201 | n/a | 0.00 | 0.00 | n/a | n/a | n/a | smoke only |
| deep-unknown | 16 | Reflex working tree | 1/1 | 62520 | n/a | 1.00 | 0.00 | n/a | n/a | n/a | smoke only |
| deep-unknown | 16 | Reflex e87bb66 | 1/1 | 127065 | n/a | 1.00 | 0.00 | n/a | n/a | n/a | smoke only |
| deep-unknown | 16 | alien-signals 3.2.1 | 1/1 | 131234 | n/a | 1.00 | 0.00 | n/a | n/a | n/a | smoke only |
| deep-unknown | 16 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 139276 | n/a | 1.00 | 0.00 | n/a | n/a | n/a | smoke only |
| deep-unknown | 16 | @vue/reactivity 3.5.43 | 1/1 | 94697 | n/a | 1.00 | 0.00 | n/a | n/a | n/a | smoke only |
| diamond-fan-in | 16 | Reflex working tree | 1/1 | 60624 | n/a | 17.00 | 1.00 | n/a | n/a | n/a | smoke only |
| diamond-fan-in | 16 | Reflex e87bb66 | 1/1 | 59524 | n/a | 17.00 | 1.00 | n/a | n/a | n/a | smoke only |
| diamond-fan-in | 16 | alien-signals 3.2.1 | 1/1 | 82001 | n/a | 17.00 | 1.00 | n/a | n/a | n/a | smoke only |
| diamond-fan-in | 16 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 23607 | n/a | 17.00 | 1.00 | n/a | n/a | n/a | smoke only |
| diamond-fan-in | 16 | @vue/reactivity 3.5.43 | 1/1 | 49925 | n/a | 17.00 | 1.00 | n/a | n/a | n/a | smoke only |
| dynamic-branch | 16 | Reflex working tree | 1/1 | 104712 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| dynamic-branch | 16 | Reflex e87bb66 | 1/1 | 100452 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| dynamic-branch | 16 | alien-signals 3.2.1 | 1/1 | 166806 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| dynamic-branch | 16 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 68190 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| dynamic-branch | 16 | @vue/reactivity 3.5.43 | 1/1 | 54054 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| effect-fanout | 16 | Reflex working tree | 1/1 | 36496 | n/a | 1.00 | 16.00 | n/a | n/a | n/a | smoke only |
| effect-fanout | 16 | Reflex e87bb66 | 1/1 | 51760 | n/a | 1.00 | 16.00 | n/a | n/a | n/a | smoke only |
| effect-fanout | 16 | alien-signals 3.2.1 | 1/1 | 106553 | n/a | 1.00 | 16.00 | n/a | n/a | n/a | smoke only |
| effect-fanout | 16 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 18765 | n/a | 1.00 | 16.00 | n/a | n/a | n/a | smoke only |
| effect-fanout | 16 | @vue/reactivity 3.5.43 | 1/1 | 75815 | n/a | 1.00 | 16.00 | n/a | n/a | n/a | smoke only |
| equal-leaf | 1 | Reflex working tree | 1/1 | 408998 | n/a | 0.00 | 0.00 | n/a | n/a | n/a | smoke only |
| equal-leaf | 1 | Reflex e87bb66 | 1/1 | 428266 | n/a | 0.00 | 0.00 | n/a | n/a | n/a | smoke only |
| equal-leaf | 1 | alien-signals 3.2.1 | 1/1 | 735294 | n/a | 0.00 | 0.00 | n/a | n/a | n/a | smoke only |
| equal-leaf | 1 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 560224 | n/a | 0.00 | 0.00 | n/a | n/a | n/a | smoke only |
| equal-leaf | 1 | @vue/reactivity 3.5.43 | 1/1 | 626959 | n/a | 0.00 | 0.00 | n/a | n/a | n/a | smoke only |
| failure-retry | 16 | Reflex working tree | 1/1 | 46382 | n/a | 17.00 | 0.00 | n/a | n/a | n/a | smoke only |
| failure-retry | 16 | Reflex e87bb66 | 1/1 | 33904 | n/a | 17.00 | 0.00 | n/a | n/a | n/a | smoke only |
| failure-retry | 16 | alien-signals 3.2.1 | 1/1 | 43048 | n/a | 17.00 | 0.00 | n/a | n/a | n/a | smoke only |
| failure-retry | 16 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 16331 | n/a | 17.00 | 0.00 | n/a | n/a | n/a | smoke only |
| failure-retry | 16 | @vue/reactivity 3.5.43 | 1/1 | 40992 | n/a | 17.00 | 0.00 | n/a | n/a | n/a | smoke only |
| layered-dag | 8 | Reflex working tree | 1/1 | 24096 | n/a | 65.00 | 1.00 | n/a | n/a | n/a | smoke only |
| layered-dag | 8 | Reflex e87bb66 | 1/1 | 32118 | n/a | 65.00 | 1.00 | n/a | n/a | n/a | smoke only |
| layered-dag | 8 | alien-signals 3.2.1 | 1/1 | 36450 | n/a | 65.00 | 1.00 | n/a | n/a | n/a | smoke only |
| layered-dag | 8 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 8769 | n/a | 65.00 | 1.00 | n/a | n/a | n/a | smoke only |
| layered-dag | 8 | @vue/reactivity 3.5.43 | 1/1 | 12020 | n/a | 65.00 | 1.00 | n/a | n/a | n/a | smoke only |
| lifecycle-churn | 16 | Reflex working tree | 1/1 | 31666 | n/a | 0.00 | 32.00 | n/a | n/a | n/a | smoke only |
| lifecycle-churn | 16 | Reflex e87bb66 | 1/1 | 31382 | n/a | 0.00 | 32.00 | n/a | n/a | n/a | smoke only |
| lifecycle-churn | 16 | alien-signals 3.2.1 | 1/1 | 28653 | n/a | 0.00 | 32.00 | n/a | n/a | n/a | smoke only |
| lifecycle-churn | 16 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 11545 | n/a | 0.00 | 32.00 | n/a | n/a | n/a | smoke only |
| lifecycle-churn | 16 | @vue/reactivity 3.5.43 | 1/1 | 33824 | n/a | 0.00 | 32.00 | n/a | n/a | n/a | smoke only |
| mostly-dirty | 256 | Reflex working tree | 1/1 | 15462 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| mostly-dirty | 256 | Reflex e87bb66 | 1/1 | 18431 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| mostly-dirty | 256 | alien-signals 3.2.1 | 1/1 | 21028 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| mostly-dirty | 256 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 8664 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| mostly-dirty | 256 | @vue/reactivity 3.5.43 | 1/1 | 832 | n/a | 192.00 | 192.00 | n/a | n/a | n/a | smoke only; not comparable: Scenario requires publicBatch for equal public observable work |
| reorder-dependencies | 64 | Reflex working tree | 1/1 | 47847 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| reorder-dependencies | 64 | Reflex e87bb66 | 1/1 | 47710 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| reorder-dependencies | 64 | alien-signals 3.2.1 | 1/1 | 44494 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| reorder-dependencies | 64 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 25275 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| reorder-dependencies | 64 | @vue/reactivity 3.5.43 | 1/1 | 44053 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| selective-update | 256 | Reflex working tree | 1/1 | 49826 | n/a | 2.00 | 1.00 | n/a | n/a | n/a | smoke only |
| selective-update | 256 | Reflex e87bb66 | 1/1 | 46544 | n/a | 2.00 | 1.00 | n/a | n/a | n/a | smoke only |
| selective-update | 256 | alien-signals 3.2.1 | 1/1 | 40478 | n/a | 2.00 | 1.00 | n/a | n/a | n/a | smoke only |
| selective-update | 256 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 18797 | n/a | 2.00 | 1.00 | n/a | n/a | n/a | smoke only |
| selective-update | 256 | @vue/reactivity 3.5.43 | 1/1 | 12642 | n/a | 2.00 | 1.00 | n/a | n/a | n/a | smoke only |
| semantic-noop-fanout | 16 | Reflex working tree | 1/1 | 80000 | n/a | 16.00 | 0.00 | n/a | n/a | n/a | smoke only |
| semantic-noop-fanout | 16 | Reflex e87bb66 | 1/1 | 70771 | n/a | 16.00 | 0.00 | n/a | n/a | n/a | smoke only |
| semantic-noop-fanout | 16 | alien-signals 3.2.1 | 1/1 | 105263 | n/a | 16.00 | 0.00 | n/a | n/a | n/a | smoke only |
| semantic-noop-fanout | 16 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 40388 | n/a | 16.00 | 0.00 | n/a | n/a | n/a | smoke only |
| semantic-noop-fanout | 16 | @vue/reactivity 3.5.43 | 1/1 | 62637 | n/a | 16.00 | 0.00 | n/a | n/a | n/a | smoke only |
| task-board | 256 | Reflex working tree | 1/1 | 53562 | n/a | 1.65 | 0.65 | n/a | n/a | n/a | smoke only |
| task-board | 256 | Reflex e87bb66 | 1/1 | 46512 | n/a | 1.65 | 0.65 | n/a | n/a | n/a | smoke only |
| task-board | 256 | alien-signals 3.2.1 | 1/1 | 50277 | n/a | 1.65 | 0.65 | n/a | n/a | n/a | smoke only |
| task-board | 256 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 19873 | n/a | 1.65 | 0.65 | n/a | n/a | n/a | smoke only |
| task-board | 256 | @vue/reactivity 3.5.43 | 1/1 | 22277 | n/a | 2.35 | 1.00 | n/a | n/a | n/a | smoke only; not comparable: Scenario requires publicBatch for equal public observable work |
| wide-fanout | 16 | Reflex working tree | 1/1 | 44613 | n/a | 16.00 | 16.00 | n/a | n/a | n/a | smoke only |
| wide-fanout | 16 | Reflex e87bb66 | 1/1 | 42194 | n/a | 16.00 | 16.00 | n/a | n/a | n/a | smoke only |
| wide-fanout | 16 | alien-signals 3.2.1 | 1/1 | 73099 | n/a | 16.00 | 16.00 | n/a | n/a | n/a | smoke only |
| wide-fanout | 16 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 18720 | n/a | 16.00 | 16.00 | n/a | n/a | n/a | smoke only |
| wide-fanout | 16 | @vue/reactivity 3.5.43 | 1/1 | 44893 | n/a | 16.00 | 16.00 | n/a | n/a | n/a | smoke only |
| window-dependency-churn | 16 | Reflex working tree | 1/1 | 100050 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| window-dependency-churn | 16 | Reflex e87bb66 | 1/1 | 96246 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| window-dependency-churn | 16 | alien-signals 3.2.1 | 1/1 | 157978 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| window-dependency-churn | 16 | @solidjs/signals 2.0.0-rc.9 | 1/1 | 46286 | n/a | 1.00 | 1.00 | n/a | n/a | n/a | smoke only |
| window-dependency-churn | 16 | @vue/reactivity 3.5.43 | 1/1 | 109830 | n/a | 2.00 | 2.00 | n/a | n/a | n/a | smoke only; not comparable: Scenario requires publicBatch for equal public observable work |

Heap deltas and GC observations are diagnostics retained in JSON/CSV, not allocation measurements. Raw phase-separated work counters and failures are retained in JSON.
