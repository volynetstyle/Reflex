# Reflex competitor benchmark

Generated: 2026-09-22T09:59:34.834Z on v25.2.0 / 14.1.146.11-node.13

Medians are across fresh-process trials. `vs Reflex` is competitor throughput divided by Reflex throughput; values below 1 are slower than Reflex.

| Scenario | Size | Framework | ops/s | p99 ns | p999 ns | retained heap Δ B/op | vs Reflex |
|---|---:|---|---:|---:|---:|---:|---:|
| effect-fanout | 16 | Reflex working tree | 46838 | 36600 | n/a | 1050.40 | 1.000 |
| effect-fanout | 16 | Reflex e87bb66 | 47483 | 44700 | n/a | 45452.00 | 1.014 |
| effect-fanout | 16 | alien-signals 3.2.1 | 67522 | 19700 | n/a | 55736.80 | 1.442 |
| effect-fanout | 16 | @solidjs/signals 2.0.0-rc.9 | 22222 | 78300 | n/a | 9058.40 | 0.474 |
| effect-fanout | 16 | @vue/reactivity 3.5.43 | 61996 | 60300 | n/a | 47086.40 | 1.324 |
| lifecycle-churn | 16 | Reflex working tree | 21796 | 97100 | n/a | 3676.00 | 1.000 |
| lifecycle-churn | 16 | Reflex e87bb66 | 25126 | 100800 | n/a | 2771.20 | 1.153 |
| lifecycle-churn | 16 | alien-signals 3.2.1 | 41017 | 110500 | n/a | 899.20 | 1.882 |
| lifecycle-churn | 16 | @solidjs/signals 2.0.0-rc.9 | 10835 | 140400 | n/a | -51529.60 | 0.497 |
| lifecycle-churn | 16 | @vue/reactivity 3.5.43 | 27840 | 83000 | n/a | 45752.00 | 1.277 |
| mostly-dirty | 16 | Reflex working tree | 56948 | 25100 | n/a | 45923.20 | 1.000 |
| mostly-dirty | 16 | Reflex e87bb66 | 52549 | 25700 | n/a | 1805.60 | 0.923 |
| mostly-dirty | 16 | alien-signals 3.2.1 | 73368 | 16400 | n/a | -38192.80 | 1.288 |
| mostly-dirty | 16 | @solidjs/signals 2.0.0-rc.9 | 26638 | 38800 | n/a | 7100.80 | 0.468 |
| mostly-dirty | 16 | @vue/reactivity 3.5.43 | 12209 | 91700 | n/a | 8032.00 | 0.214 |
| task-board | 32 | Reflex working tree | 46642 | 25600 | n/a | -43716.00 | 1.000 |
| task-board | 32 | Reflex e87bb66 | 48031 | 14000 | n/a | 311.20 | 1.030 |
| task-board | 32 | alien-signals 3.2.1 | 47506 | 14400 | n/a | 48072.80 | 1.019 |
| task-board | 32 | @solidjs/signals 2.0.0-rc.9 | 25967 | 88300 | n/a | 7773.60 | 0.557 |
| task-board | 32 | @vue/reactivity 3.5.43 | 34746 | 41700 | n/a | 1477.60 | 0.745 |
| window-dependency-churn | 16 | Reflex working tree | 48031 | 18700 | n/a | 41477.60 | 1.000 |
| window-dependency-churn | 16 | Reflex e87bb66 | 48170 | 17700 | n/a | 38329.60 | 1.003 |
| window-dependency-churn | 16 | alien-signals 3.2.1 | 46339 | 23500 | n/a | 7333.60 | 0.965 |
| window-dependency-churn | 16 | @solidjs/signals 2.0.0-rc.9 | 18667 | 25700 | n/a | 782.40 | 0.389 |
| window-dependency-churn | 16 | @vue/reactivity 3.5.43 | 51073 | 20400 | n/a | 39840.00 | 1.063 |

Raw worker results, actual-work counters, GC observations, and failures are retained in the JSON report.
