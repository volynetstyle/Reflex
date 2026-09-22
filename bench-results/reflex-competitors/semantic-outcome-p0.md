# Reflex competitor benchmark

Generated: 2026-09-22T12:26:55.339Z on v25.2.0 / 14.1.146.11-node.13

Medians are across fresh-process trials. `vs Reflex` is the median of same-trial throughput ratios; values below 1 are slower than Reflex. Ratios are withheld for failed or capability-incompatible runs.

| Scenario | Size | Framework | Trials | ops/s | MAD % | computed/op | effects/op | p99 ns | p999 ns | vs Reflex | Status |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| changed-result | 1 | Reflex working tree | 5/5 | 16580323 | 2.04 | 1.00 | 1.00 | 300 | n/a | 1.000 | comparable |
| changed-result | 1 | Reflex e87bb66 | 5/5 | 15572317 | 3.40 | 1.00 | 1.00 | 400 | n/a | 0.914 | comparable |
| changed-result | 1 | alien-signals 3.2.1 | 5/5 | 17445636 | 3.12 | 1.00 | 1.00 | 300 | n/a | 1.085 | comparable |
| changed-result | 1 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 2277497 | 4.76 | 1.00 | 1.00 | 800 | n/a | 0.139 | comparable |
| changed-result | 1 | @vue/reactivity 3.5.43 | 5/5 | 11481025 | 1.66 | 1.00 | 1.00 | 400 | n/a | 0.690 | comparable |
| equal-leaf | 1 | Reflex working tree | 5/5 | 101887355 | 5.67 | 0.00 | 0.00 | 200 | n/a | 1.000 | comparable |
| equal-leaf | 1 | Reflex e87bb66 | 5/5 | 105765674 | 2.57 | 0.00 | 0.00 | 200 | n/a | 1.041 | comparable |
| equal-leaf | 1 | alien-signals 3.2.1 | 5/5 | 181669529 | 3.58 | 0.00 | 0.00 | 200 | n/a | 1.728 | comparable |
| equal-leaf | 1 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 68679700 | 10.91 | 0.00 | 0.00 | 200 | n/a | 0.641 | comparable |
| equal-leaf | 1 | @vue/reactivity 3.5.43 | 5/5 | 558105780 | 1.51 | 0.00 | 0.00 | 200 | n/a | 5.454 | comparable |
| equal-result | 1 | Reflex working tree | 5/5 | 20797382 | 1.28 | 1.00 | 0.00 | 300 | n/a | 1.000 | comparable |
| equal-result | 1 | Reflex e87bb66 | 5/5 | 21247455 | 3.49 | 1.00 | 0.00 | 300 | n/a | 1.001 | comparable |
| equal-result | 1 | alien-signals 3.2.1 | 5/5 | 21459129 | 2.07 | 1.00 | 0.00 | 300 | n/a | 1.026 | comparable |
| equal-result | 1 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 5077847 | 1.27 | 1.00 | 0.00 | 500 | n/a | 0.245 | comparable |
| equal-result | 1 | @vue/reactivity 3.5.43 | 5/5 | 14913590 | 3.70 | 1.00 | 0.00 | 300 | n/a | 0.708 | comparable |

Cross-runtime final-checksum comparison was skipped for 15 adaptive trace group(s) with different operation counts. Every worker still passed its scenario model validation; trace lengths are retained in JSON.

Heap deltas and GC observations are diagnostics retained in JSON/CSV, not allocation measurements. Raw phase-separated work counters and failures are retained in JSON.
