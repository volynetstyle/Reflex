# Reflex competitor benchmark

Generated: 2026-09-22T11:51:52.624Z on v25.2.0 / 14.1.146.11-node.13

Medians are across fresh-process trials. `vs Reflex` is the median of same-trial throughput ratios; values below 1 are slower than Reflex. Ratios are withheld for failed or capability-incompatible runs.

| Scenario | Size | Framework | Trials | ops/s | MAD % | computed/op | effects/op | p99 ns | p999 ns | vs Reflex | Status |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| effect-fanout | 16 | Reflex working tree | 5/5 | 1946346 | 0.18 | 1.00 | 16.00 | 900 | n/a | 1.000 | comparable |
| effect-fanout | 16 | Reflex e87bb66 | 5/5 | 2005937 | 0.83 | 1.00 | 16.00 | 900 | n/a | 1.047 | comparable |
| effect-fanout | 16 | alien-signals 3.2.1 | 5/5 | 2635887 | 0.07 | 1.00 | 16.00 | 800 | n/a | 1.354 | comparable |
| effect-fanout | 16 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 432151 | 1.55 | 1.00 | 16.00 | 3500 | n/a | 0.222 | comparable |
| effect-fanout | 16 | @vue/reactivity 3.5.43 | 5/5 | 1760068 | 3.15 | 1.00 | 16.00 | 900 | n/a | 0.950 | comparable |
| effect-fanout | 256 | Reflex working tree | 5/5 | 123991 | 2.52 | 1.00 | 256.00 | 11300 | n/a | 1.000 | comparable |
| effect-fanout | 256 | Reflex e87bb66 | 5/5 | 129817 | 0.66 | 1.00 | 256.00 | 18800 | n/a | 1.054 | comparable |
| effect-fanout | 256 | alien-signals 3.2.1 | 5/5 | 134864 | 5.59 | 1.00 | 256.00 | 9500 | n/a | 1.053 | comparable |
| effect-fanout | 256 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 31986 | 2.90 | 1.00 | 256.00 | 44200 | n/a | 0.258 | comparable |
| effect-fanout | 256 | @vue/reactivity 3.5.43 | 5/5 | 125920 | 4.69 | 1.00 | 256.00 | 10400 | n/a | 0.987 | comparable |
| wide-fanout | 16 | Reflex working tree | 5/5 | 1226791 | 0.71 | 16.00 | 16.00 | 1200 | n/a | 1.000 | comparable |
| wide-fanout | 16 | Reflex e87bb66 | 5/5 | 1200818 | 2.74 | 16.00 | 16.00 | 1400 | n/a | 0.953 | comparable |
| wide-fanout | 16 | alien-signals 3.2.1 | 5/5 | 1305276 | 3.33 | 16.00 | 16.00 | 1100 | n/a | 1.049 | comparable |
| wide-fanout | 16 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 227413 | 2.53 | 16.00 | 16.00 | 5500 | n/a | 0.185 | comparable |
| wide-fanout | 16 | @vue/reactivity 3.5.43 | 5/5 | 877796 | 0.99 | 16.00 | 16.00 | 1600 | n/a | 0.721 | comparable |
| wide-fanout | 256 | Reflex working tree | 5/5 | 74645 | 5.50 | 256.00 | 256.00 | 17700 | n/a | 1.000 | comparable |
| wide-fanout | 256 | Reflex e87bb66 | 5/5 | 71941 | 2.00 | 256.00 | 256.00 | 22300 | n/a | 0.941 | comparable |
| wide-fanout | 256 | alien-signals 3.2.1 | 5/5 | 69365 | 1.50 | 256.00 | 256.00 | 17500 | n/a | 0.929 | comparable |
| wide-fanout | 256 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 15203 | 1.43 | 256.00 | 256.00 | 86200 | n/a | 0.204 | comparable |
| wide-fanout | 256 | @vue/reactivity 3.5.43 | 5/5 | 50013 | 7.52 | 256.00 | 256.00 | 28300 | n/a | 0.629 | comparable |

Cross-runtime final-checksum comparison was skipped for 20 adaptive trace group(s) with different operation counts. Every worker still passed its scenario model validation; trace lengths are retained in JSON.

Heap deltas and GC observations are diagnostics retained in JSON/CSV, not allocation measurements. Raw phase-separated work counters and failures are retained in JSON.
