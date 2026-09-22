# Reflex competitor benchmark

Generated: 2026-09-22T08:41:06.761Z on v25.2.0 / 14.1.146.11-node.13

Medians are across fresh-process trials. `vs Reflex` is competitor throughput divided by Reflex throughput; values below 1 are slower than Reflex.

| Scenario | Size | Framework | ops/s | p99 ns | p999 ns | retained B/op | vs Reflex |
|---|---:|---|---:|---:|---:|---:|---:|
| changed-leaf | 1 | Reflex 1.0.0 | 3332112 | 800 | 3600 | 0.42 | 1.000 |
| changed-leaf | 1 | alien-signals 3.2.1 | 4423409 | 500 | 8100 | 2.13 | 1.328 |
| changed-leaf | 1 | @solidjs/signals 2.0.0-rc.9 | 1364852 | 3200 | 13800 | 0.70 | 0.410 |
| changed-leaf | 1 | @vue/reactivity 3.5.43 | 4408005 | 200 | 900 | 0.42 | 1.323 |

Raw worker results, actual-work counters, GC observations, and failures are retained in the JSON report.
