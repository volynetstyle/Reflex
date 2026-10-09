# Reflex competitor benchmark

Generated: 2026-09-22T17:27:27.887Z on v25.2.0 / 14.1.146.11-node.13

Medians are across fresh-process trials. `vs Reflex` is the median of same-trial throughput ratios; values below 1 are slower than Reflex. Ratios are withheld for failed or capability-incompatible runs.

| Scenario | Size | Framework | Trials | ops/s | MAD % | computed/op | effects/op | p99 ns | p999 ns | vs Reflex | Status |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| effect-fanout | 1 | Reflex working tree | 5/5 | 18083876 | 1.47 | 1.00 | 1.00 | 300 | n/a | 1.000 | comparable |
| effect-fanout | 1 | Reflex e87bb66 | 5/5 | 16094591 | 3.36 | 1.00 | 1.00 | 400 | n/a | 0.860 | comparable |
| effect-fanout | 1 | alien-signals 3.2.1 | 5/5 | 18015823 | 5.89 | 1.00 | 1.00 | 300 | n/a | 0.960 | comparable |
| effect-fanout | 1 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 2274489 | 6.37 | 1.00 | 1.00 | 800 | n/a | 0.127 | comparable |
| effect-fanout | 1 | @vue/reactivity 3.5.43 | 5/5 | 12224192 | 1.78 | 1.00 | 1.00 | 400 | n/a | 0.673 | comparable |
| effect-fanout | 2 | Reflex working tree | 5/5 | 12024652 | 3.66 | 1.00 | 2.00 | 400 | n/a | 1.000 | comparable |
| effect-fanout | 2 | Reflex e87bb66 | 5/5 | 10383020 | 4.02 | 1.00 | 2.00 | 400 | n/a | 0.867 | comparable |
| effect-fanout | 2 | alien-signals 3.2.1 | 5/5 | 12363025 | 1.16 | 1.00 | 2.00 | 400 | n/a | 1.016 | comparable |
| effect-fanout | 2 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 1768784 | 1.35 | 1.00 | 2.00 | 1000 | n/a | 0.147 | comparable |
| effect-fanout | 2 | @vue/reactivity 3.5.43 | 5/5 | 8649847 | 4.50 | 1.00 | 2.00 | 400 | n/a | 0.694 | comparable |
| effect-fanout | 4 | Reflex working tree | 5/5 | 7326041 | 2.05 | 1.00 | 4.00 | 500 | n/a | 1.000 | comparable |
| effect-fanout | 4 | Reflex e87bb66 | 5/5 | 6582919 | 2.93 | 1.00 | 4.00 | 500 | n/a | 0.884 | comparable |
| effect-fanout | 4 | alien-signals 3.2.1 | 5/5 | 7536884 | 14.90 | 1.00 | 4.00 | 400 | n/a | 1.047 | comparable |
| effect-fanout | 4 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 1176996 | 2.38 | 1.00 | 4.00 | 1500 | n/a | 0.157 | comparable |
| effect-fanout | 4 | @vue/reactivity 3.5.43 | 5/5 | 5910846 | 5.89 | 1.00 | 4.00 | 500 | n/a | 0.791 | comparable |
| effect-fanout | 8 | Reflex working tree | 5/5 | 3682357 | 6.37 | 1.00 | 8.00 | 600 | n/a | 1.000 | comparable |
| effect-fanout | 8 | Reflex e87bb66 | 5/5 | 3405336 | 2.57 | 1.00 | 8.00 | 700 | n/a | 0.917 | comparable |
| effect-fanout | 8 | alien-signals 3.2.1 | 5/5 | 4737546 | 2.47 | 1.00 | 8.00 | 500 | n/a | 1.267 | comparable |
| effect-fanout | 8 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 729043 | 1.48 | 1.00 | 8.00 | 2100 | n/a | 0.201 | comparable |
| effect-fanout | 8 | @vue/reactivity 3.5.43 | 5/5 | 3257761 | 2.93 | 1.00 | 8.00 | 700 | n/a | 0.909 | comparable |
| effect-fanout | 16 | Reflex working tree | 5/5 | 2134757 | 2.28 | 1.00 | 16.00 | 900 | n/a | 1.000 | comparable |
| effect-fanout | 16 | Reflex e87bb66 | 5/5 | 1952493 | 0.41 | 1.00 | 16.00 | 1000 | n/a | 0.941 | comparable |
| effect-fanout | 16 | alien-signals 3.2.1 | 5/5 | 2651363 | 2.44 | 1.00 | 16.00 | 800 | n/a | 1.244 | comparable |
| effect-fanout | 16 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 399796 | 1.72 | 1.00 | 16.00 | 4300 | n/a | 0.197 | comparable |
| effect-fanout | 16 | @vue/reactivity 3.5.43 | 5/5 | 1724949 | 5.08 | 1.00 | 16.00 | 1000 | n/a | 0.829 | comparable |
| effect-fanout | 32 | Reflex working tree | 5/5 | 1100740 | 1.35 | 1.00 | 32.00 | 1300 | n/a | 1.000 | comparable |
| effect-fanout | 32 | Reflex e87bb66 | 5/5 | 1043010 | 1.50 | 1.00 | 32.00 | 1400 | n/a | 0.930 | comparable |
| effect-fanout | 32 | alien-signals 3.2.1 | 5/5 | 1383106 | 3.49 | 1.00 | 32.00 | 1100 | n/a | 1.236 | comparable |
| effect-fanout | 32 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 241429 | 1.11 | 1.00 | 32.00 | 5400 | n/a | 0.219 | comparable |
| effect-fanout | 32 | @vue/reactivity 3.5.43 | 5/5 | 971034 | 0.86 | 1.00 | 32.00 | 1500 | n/a | 0.891 | comparable |
| effect-fanout | 64 | Reflex working tree | 5/5 | 573301 | 3.38 | 1.00 | 64.00 | 2900 | n/a | 1.000 | comparable |
| effect-fanout | 64 | Reflex e87bb66 | 5/5 | 533387 | 0.47 | 1.00 | 64.00 | 3300 | n/a | 0.924 | comparable |
| effect-fanout | 64 | alien-signals 3.2.1 | 5/5 | 705934 | 3.65 | 1.00 | 64.00 | 1900 | n/a | 1.224 | comparable |
| effect-fanout | 64 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 123259 | 4.46 | 1.00 | 64.00 | 13200 | n/a | 0.215 | comparable |
| effect-fanout | 64 | @vue/reactivity 3.5.43 | 5/5 | 490575 | 1.68 | 1.00 | 64.00 | 2600 | n/a | 0.831 | comparable |
| effect-fanout | 128 | Reflex working tree | 5/5 | 237804 | 15.49 | 1.00 | 128.00 | 5900 | n/a | 1.000 | comparable |
| effect-fanout | 128 | Reflex e87bb66 | 5/5 | 260527 | 3.80 | 1.00 | 128.00 | 5000 | n/a | 1.152 | comparable |
| effect-fanout | 128 | alien-signals 3.2.1 | 5/5 | 297216 | 2.84 | 1.00 | 128.00 | 4100 | n/a | 1.170 | comparable |
| effect-fanout | 128 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 61795 | 1.85 | 1.00 | 128.00 | 32600 | n/a | 0.241 | comparable |
| effect-fanout | 128 | @vue/reactivity 3.5.43 | 5/5 | 246281 | 2.15 | 1.00 | 128.00 | 5300 | n/a | 1.044 | comparable |
| effect-fanout | 256 | Reflex working tree | 5/5 | 130359 | 1.60 | 1.00 | 256.00 | 11700 | n/a | 1.000 | comparable |
| effect-fanout | 256 | Reflex e87bb66 | 5/5 | 110093 | 2.83 | 1.00 | 256.00 | 12700 | n/a | 0.892 | comparable |
| effect-fanout | 256 | alien-signals 3.2.1 | 5/5 | 123985 | 3.06 | 1.00 | 256.00 | 16200 | n/a | 0.980 | comparable |
| effect-fanout | 256 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 32547 | 4.18 | 1.00 | 256.00 | 45300 | n/a | 0.255 | comparable |
| effect-fanout | 256 | @vue/reactivity 3.5.43 | 5/5 | 124344 | 2.66 | 1.00 | 256.00 | 11900 | n/a | 1.002 | comparable |
| effect-fanout | 512 | Reflex working tree | 5/5 | 69905 | 7.05 | 1.00 | 512.00 | 18900 | n/a | 1.000 | comparable |
| effect-fanout | 512 | Reflex e87bb66 | 5/5 | 64650 | 1.21 | 1.00 | 512.00 | 18100 | n/a | 0.915 | comparable |
| effect-fanout | 512 | alien-signals 3.2.1 | 5/5 | 66863 | 1.73 | 1.00 | 512.00 | 19500 | n/a | 0.920 | comparable |
| effect-fanout | 512 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 15717 | 5.67 | 1.00 | 512.00 | 107600 | n/a | 0.224 | comparable |
| effect-fanout | 512 | @vue/reactivity 3.5.43 | 5/5 | 65512 | 2.37 | 1.00 | 512.00 | 17600 | n/a | 0.915 | comparable |
| effect-fanout | 1024 | Reflex working tree | 5/5 | 32782 | 5.54 | 1.00 | 1024.00 | 42800 | n/a | 1.000 | comparable |
| effect-fanout | 1024 | Reflex e87bb66 | 5/5 | 32904 | 2.09 | 1.00 | 1024.00 | 46700 | n/a | 1.007 | comparable |
| effect-fanout | 1024 | alien-signals 3.2.1 | 5/5 | 31151 | 2.40 | 1.00 | 1024.00 | 45900 | n/a | 0.948 | comparable |
| effect-fanout | 1024 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 8526 | 1.04 | 1.00 | 1024.00 | 242900 | n/a | 0.246 | comparable |
| effect-fanout | 1024 | @vue/reactivity 3.5.43 | 5/5 | 32579 | 4.68 | 1.00 | 1024.00 | 50500 | n/a | 0.929 | comparable |

Cross-runtime final-checksum comparison was skipped for 55 adaptive trace group(s) with different operation counts. Every worker still passed its scenario model validation; trace lengths are retained in JSON.

Heap deltas and GC observations are diagnostics retained in JSON/CSV, not allocation measurements. Raw phase-separated work counters and failures are retained in JSON.
