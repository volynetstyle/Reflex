# Reflex competitor benchmark

Generated: 2026-09-22T08:41:15.109Z on v25.2.0 / 14.1.146.11-node.13

Medians are across fresh-process trials. `vs Reflex` is competitor throughput divided by Reflex throughput; values below 1 are slower than Reflex.

| Scenario | Size | Framework | ops/s | p99 ns | p999 ns | retained B/op | vs Reflex |
|---|---:|---|---:|---:|---:|---:|---:|
| task-board | 256 | Reflex 1.0.0 | 336795 | 3900 | 10500 | 1.84 | 1.000 |
| task-board | 256 | alien-signals 3.2.1 | 388787 | 5100 | 19400 | 1.87 | 1.154 |
| task-board | 256 | @solidjs/signals 2.0.0-rc.9 | 123685 | 15600 | 37700 | 7.00 | 0.367 |
| task-board | 256 | @vue/reactivity 3.5.43 | 119891 | 16800 | 50300 | 3.19 | 0.356 |

Raw worker results, actual-work counters, GC observations, and failures are retained in the JSON report.
