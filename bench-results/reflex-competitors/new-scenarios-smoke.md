# Reflex competitor benchmark

Generated: 2026-09-22T09:26:28.959Z on v25.2.0 / 14.1.146.11-node.13

Medians are across fresh-process trials. `vs Reflex` is competitor throughput divided by Reflex throughput; values below 1 are slower than Reflex.

| Scenario | Size | Framework | ops/s | p99 ns | p999 ns | retained B/op | vs Reflex |
|---|---:|---|---:|---:|---:|---:|---:|
| effect-fanout | 16 | Reflex 1.0.0 | 51282 | 124700 | 124700 | 534.80 | 1.000 |
| effect-fanout | 16 | alien-signals 3.2.1 | 94652 | 27100 | 27100 | -4744.80 | 1.846 |
| effect-fanout | 16 | @solidjs/signals 2.0.0-rc.9 | 28110 | 94500 | 94500 | -23080.00 | 0.548 |
| effect-fanout | 16 | @vue/reactivity 3.5.43 | 75500 | 74200 | 74200 | 23571.60 | 1.472 |
| failure-retry | 16 | Reflex 1.0.0 | 33140 | 52800 | 52800 | 10343.20 | 1.000 |
| failure-retry | 16 | alien-signals 3.2.1 | 11292 | 45200 | 45200 | 618.40 | 0.341 |
| failure-retry | 16 | @solidjs/signals 2.0.0-rc.9 | 15839 | 181900 | 181900 | 4944.00 | 0.478 |
| failure-retry | 16 | @vue/reactivity 3.5.43 | 41042 | 35700 | 35700 | -43253.60 | 1.238 |
| lifecycle-churn | 16 | Reflex 1.0.0 | 28114 | 144100 | 144100 | 24961.20 | 1.000 |
| lifecycle-churn | 16 | alien-signals 3.2.1 | 31471 | 122500 | 122500 | -12791.20 | 1.119 |
| lifecycle-churn | 16 | @solidjs/signals 2.0.0-rc.9 | 12955 | 197200 | 197200 | 24902.80 | 0.461 |
| lifecycle-churn | 16 | @vue/reactivity 3.5.43 | 31358 | 277700 | 277700 | -16881.60 | 1.115 |
| semantic-noop-fanout | 16 | Reflex 1.0.0 | 63715 | 23700 | 23700 | 249.20 | 1.000 |
| semantic-noop-fanout | 16 | alien-signals 3.2.1 | 103681 | 16100 | 16100 | -396.40 | 1.627 |
| semantic-noop-fanout | 16 | @solidjs/signals 2.0.0-rc.9 | 38926 | 37100 | 37100 | -3270.80 | 0.611 |
| semantic-noop-fanout | 16 | @vue/reactivity 3.5.43 | 60790 | 73200 | 73200 | 11382.00 | 0.954 |
| window-dependency-churn | 16 | Reflex 1.0.0 | 82338 | 11100 | 11100 | 13884.40 | 1.000 |
| window-dependency-churn | 16 | alien-signals 3.2.1 | 156740 | 5000 | 5000 | 106.40 | 1.904 |
| window-dependency-churn | 16 | @solidjs/signals 2.0.0-rc.9 | 47540 | 14900 | 14900 | 714.40 | 0.577 |
| window-dependency-churn | 16 | @vue/reactivity 3.5.43 | 125235 | 25000 | 25000 | 5508.80 | 1.521 |

Raw worker results, actual-work counters, GC observations, and failures are retained in the JSON report.
