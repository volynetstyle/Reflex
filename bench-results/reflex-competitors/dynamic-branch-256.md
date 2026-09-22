# Reflex competitor benchmark

Generated: 2026-09-22T08:41:10.582Z on v25.2.0 / 14.1.146.11-node.13

Medians are across fresh-process trials. `vs Reflex` is competitor throughput divided by Reflex throughput; values below 1 are slower than Reflex.

| Scenario | Size | Framework | ops/s | p99 ns | p999 ns | retained B/op | vs Reflex |
|---|---:|---|---:|---:|---:|---:|---:|
| dynamic-branch | 256 | Reflex 1.0.0 | 914801 | 2600 | 6500 | 0.76 | 1.000 |
| dynamic-branch | 256 | alien-signals 3.2.1 | 1233654 | 2600 | 10700 | 1.21 | 1.349 |
| dynamic-branch | 256 | @solidjs/signals 2.0.0-rc.9 | 418498 | 8200 | 41900 | 1.18 | 0.457 |
| dynamic-branch | 256 | @vue/reactivity 3.5.43 | 1014645 | 3000 | 17200 | 4.25 | 1.109 |

Raw worker results, actual-work counters, GC observations, and failures are retained in the JSON report.
