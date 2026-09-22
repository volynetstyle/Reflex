# Reflex competitor benchmark

Generated: 2026-09-22T08:41:28.576Z on v25.2.0 / 14.1.146.11-node.13

Medians are across fresh-process trials. `vs Reflex` is competitor throughput divided by Reflex throughput; values below 1 are slower than Reflex.

| Scenario | Size | Framework | ops/s | p99 ns | p999 ns | retained B/op | vs Reflex |
|---|---:|---|---:|---:|---:|---:|---:|
| changed-chain | 16384 | Reflex 1.0.0 | 1167 | 2161600 | 3806700 | 258.27 | 1.000 |
| changed-chain | 16384 | alien-signals 3.2.1 | 776 | 3531600 | 4086000 | 89.13 | 0.665 |
| changed-chain | 16384 | @solidjs/signals 2.0.0-rc.9 | 239 | 5300400 | 6432000 | 504.67 | 0.205 |
| changed-chain | 16384 | @vue/reactivity 3.5.43 | failed | failed | failed | failed | failed |

Raw worker results, actual-work counters, GC observations, and failures are retained in the JSON report.
