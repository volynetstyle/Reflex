# Reflex competitor benchmark

Generated: 2026-09-22T10:22:34.516Z on v25.2.0 / 14.1.146.11-node.13

Medians are across fresh-process trials. `vs Reflex` is the median of same-trial throughput ratios; values below 1 are slower than Reflex. Ratios are withheld for failed or capability-incompatible runs.

| Scenario | Size | Framework | Trials | ops/s | MAD % | computed/op | effects/op | p99 ns | p999 ns | vs Reflex | Status |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| changed-leaf | 1 | Reflex working tree | 5/5 | 26192897 | 2.98 | 0.00 | 1.00 | 300 | n/a | 1.000 | comparable |
| changed-leaf | 1 | Reflex e87bb66 | 5/5 | 27392199 | 0.53 | 0.00 | 1.00 | 400 | n/a | 1.016 | comparable |
| changed-leaf | 1 | alien-signals 3.2.1 | 5/5 | 32106969 | 1.62 | 0.00 | 1.00 | 300 | n/a | 1.208 | comparable |
| changed-leaf | 1 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 4322954 | 2.20 | 0.00 | 1.00 | 900 | n/a | 0.161 | comparable |
| changed-leaf | 1 | @vue/reactivity 3.5.43 | 5/5 | 27044073 | 1.24 | 0.00 | 1.00 | 300 | n/a | 0.999 | comparable |
| diamond-fan-in | 16 | Reflex working tree | 5/5 | 1945092 | 1.02 | 17.00 | 1.00 | 1200 | n/a | 1.000 | comparable |
| diamond-fan-in | 16 | Reflex e87bb66 | 5/5 | 1918327 | 1.22 | 17.00 | 1.00 | 1300 | n/a | 0.984 | comparable |
| diamond-fan-in | 16 | alien-signals 3.2.1 | 5/5 | 2257423 | 1.55 | 17.00 | 1.00 | 1200 | n/a | 1.145 | comparable |
| diamond-fan-in | 16 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 319887 | 0.22 | 17.00 | 1.00 | 5600 | n/a | 0.164 | comparable |
| diamond-fan-in | 16 | @vue/reactivity 3.5.43 | 5/5 | 1049432 | 1.17 | 17.00 | 1.00 | 2300 | n/a | 0.535 | comparable |
| mostly-dirty | 16 | Reflex working tree | 5/5 | 2540799 | 0.84 | 1.00 | 1.00 | 1200 | n/a | 1.000 | comparable |
| mostly-dirty | 16 | Reflex e87bb66 | 5/5 | 2430411 | 2.29 | 1.00 | 1.00 | 1300 | n/a | 0.957 | comparable |
| mostly-dirty | 16 | alien-signals 3.2.1 | 5/5 | 2459123 | 2.74 | 1.00 | 1.00 | 1100 | n/a | 0.989 | comparable |
| mostly-dirty | 16 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 827092 | 1.18 | 1.00 | 1.00 | 2500 | n/a | 0.324 | comparable |
| mostly-dirty | 16 | @vue/reactivity 3.5.43 | 5/5 | 225758 | 0.75 | 12.00 | 12.00 | 5700 | n/a | n/a | not comparable: Scenario requires publicBatch for equal public observable work |

Cross-runtime final-checksum comparison was skipped for 15 adaptive trace group(s) with different operation counts. Every worker still passed its scenario model validation; trace lengths are retained in JSON.

Heap deltas and GC observations are diagnostics retained in JSON/CSV, not allocation measurements. Raw phase-separated work counters and failures are retained in JSON.
