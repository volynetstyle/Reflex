# Reflex competitor benchmark

Generated: 2026-09-22T09:44:50.251Z on v25.2.0 / 14.1.146.11-node.13

Medians are across fresh-process trials. `vs Reflex` is competitor throughput divided by Reflex throughput; values below 1 are slower than Reflex.

| Scenario | Size | Framework | ops/s | p99 ns | p999 ns | retained heap Δ B/op | vs Reflex |
|---|---:|---|---:|---:|---:|---:|---:|
| changed-leaf | 1 | Reflex working tree | 181984 | n/a | n/a | -11084.80 | 1.000 |
| changed-leaf | 1 | Reflex e87bb66 | 92635 | n/a | n/a | 115.20 | 0.509 |

Raw worker results, actual-work counters, GC observations, and failures are retained in the JSON report.
