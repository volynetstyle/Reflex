# Reflex competitor benchmark

Generated: 2026-09-22T09:59:23.067Z on v25.2.0 / 14.1.146.11-node.13

Medians are across fresh-process trials. `vs Reflex` is competitor throughput divided by Reflex throughput; values below 1 are slower than Reflex.

| Scenario | Size | Framework | ops/s | p99 ns | p999 ns | retained heap Δ B/op | vs Reflex |
|---|---:|---|---:|---:|---:|---:|---:|
| diamond-fan-in | 16 | Reflex working tree | 49554 | 36000 | n/a | 2800.80 | 1.000 |
| diamond-fan-in | 16 | Reflex e87bb66 | 49432 | 30600 | n/a | -21028.80 | 0.998 |
| diamond-fan-in | 16 | alien-signals 3.2.1 | 65746 | 20900 | n/a | 362.40 | 1.327 |
| diamond-fan-in | 16 | @solidjs/signals 2.0.0-rc.9 | 19802 | 112300 | n/a | 6818.40 | 0.400 |
| diamond-fan-in | 16 | @vue/reactivity 3.5.43 | 43975 | 39400 | n/a | 53135.20 | 0.887 |
| wide-fanout | 16 | Reflex working tree | 49826 | 25600 | n/a | -44465.60 | 1.000 |
| wide-fanout | 16 | Reflex e87bb66 | 49261 | 22900 | n/a | -43145.60 | 0.989 |
| wide-fanout | 16 | alien-signals 3.2.1 | 60716 | 18100 | n/a | 31032.80 | 1.219 |
| wide-fanout | 16 | @solidjs/signals 2.0.0-rc.9 | 19168 | 69800 | n/a | 26545.60 | 0.385 |
| wide-fanout | 16 | @vue/reactivity 3.5.43 | 43573 | 48100 | n/a | 34084.00 | 0.875 |

Raw worker results, actual-work counters, GC observations, and failures are retained in the JSON report.
