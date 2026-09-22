# Reflex competitor benchmark

Generated: 2026-09-22T17:29:09.505Z on v25.2.0 / 14.1.146.11-node.13

Medians are across fresh-process trials. `vs Reflex` is the median of same-trial throughput ratios; values below 1 are slower than Reflex. Ratios are withheld for failed or capability-incompatible runs.

| Scenario | Size | Framework | Trials | ops/s | MAD % | computed/op | effects/op | p99 ns | p999 ns | vs Reflex | Status |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| effect-fanout-body | 1 | Reflex working tree | 5/5 | 1076866 | 2.75 | 1.00 | 32.00 | 1400 | n/a | 1.000 | comparable |
| effect-fanout-body | 1 | Reflex e87bb66 | 5/5 | 932295 | 2.50 | 1.00 | 32.00 | 1500 | n/a | 0.886 | comparable |
| effect-fanout-body | 1 | alien-signals 3.2.1 | 5/5 | 1277869 | 3.37 | 1.00 | 32.00 | 1400 | n/a | 1.178 | comparable |
| effect-fanout-body | 1 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 235048 | 2.03 | 1.00 | 32.00 | 5800 | n/a | 0.223 | comparable |
| effect-fanout-body | 1 | @vue/reactivity 3.5.43 | 5/5 | 888592 | 0.70 | 1.00 | 32.00 | 2400 | n/a | 0.804 | comparable |
| effect-fanout-body | 4 | Reflex working tree | 5/5 | 1041616 | 1.68 | 1.00 | 32.00 | 1400 | n/a | 1.000 | comparable |
| effect-fanout-body | 4 | Reflex e87bb66 | 5/5 | 886772 | 1.35 | 1.00 | 32.00 | 1600 | n/a | 0.904 | comparable |
| effect-fanout-body | 4 | alien-signals 3.2.1 | 5/5 | 1170506 | 4.01 | 1.00 | 32.00 | 1300 | n/a | 1.179 | comparable |
| effect-fanout-body | 4 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 234028 | 1.62 | 1.00 | 32.00 | 8100 | n/a | 0.227 | comparable |
| effect-fanout-body | 4 | @vue/reactivity 3.5.43 | 5/5 | 882482 | 2.43 | 1.00 | 32.00 | 1700 | n/a | 0.855 | comparable |
| effect-fanout-body | 16 | Reflex working tree | 5/5 | 798132 | 2.88 | 1.00 | 32.00 | 1600 | n/a | 1.000 | comparable |
| effect-fanout-body | 16 | Reflex e87bb66 | 5/5 | 743368 | 2.87 | 1.00 | 32.00 | 1800 | n/a | 0.940 | comparable |
| effect-fanout-body | 16 | alien-signals 3.2.1 | 5/5 | 975774 | 1.35 | 1.00 | 32.00 | 1500 | n/a | 1.220 | comparable |
| effect-fanout-body | 16 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 225446 | 3.22 | 1.00 | 32.00 | 5900 | n/a | 0.282 | comparable |
| effect-fanout-body | 16 | @vue/reactivity 3.5.43 | 5/5 | 713320 | 2.61 | 1.00 | 32.00 | 1900 | n/a | 0.884 | comparable |
| effect-fanout-body | 64 | Reflex working tree | 5/5 | 328966 | 2.41 | 1.00 | 32.00 | 4100 | n/a | 1.000 | comparable |
| effect-fanout-body | 64 | Reflex e87bb66 | 5/5 | 316764 | 1.50 | 1.00 | 32.00 | 4500 | n/a | 0.953 | comparable |
| effect-fanout-body | 64 | alien-signals 3.2.1 | 5/5 | 352220 | 1.30 | 1.00 | 32.00 | 3400 | n/a | 1.045 | comparable |
| effect-fanout-body | 64 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 158688 | 3.50 | 1.00 | 32.00 | 8200 | n/a | 0.481 | comparable |
| effect-fanout-body | 64 | @vue/reactivity 3.5.43 | 5/5 | 321700 | 0.30 | 1.00 | 32.00 | 4900 | n/a | 0.955 | comparable |
| effect-fanout-body | 256 | Reflex working tree | 5/5 | 96184 | 2.52 | 1.00 | 32.00 | 12900 | n/a | 1.000 | comparable |
| effect-fanout-body | 256 | Reflex e87bb66 | 5/5 | 96509 | 0.38 | 1.00 | 32.00 | 12300 | n/a | 0.998 | comparable |
| effect-fanout-body | 256 | alien-signals 3.2.1 | 5/5 | 97035 | 1.01 | 1.00 | 32.00 | 11800 | n/a | 0.997 | comparable |
| effect-fanout-body | 256 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 71527 | 1.93 | 1.00 | 32.00 | 20400 | n/a | 0.758 | comparable |
| effect-fanout-body | 256 | @vue/reactivity 3.5.43 | 5/5 | 96732 | 2.11 | 1.00 | 32.00 | 12700 | n/a | 1.002 | comparable |
| effect-fanout-body | 1024 | Reflex working tree | 5/5 | 25255 | 1.60 | 1.00 | 32.00 | 43600 | n/a | 1.000 | comparable |
| effect-fanout-body | 1024 | Reflex e87bb66 | 5/5 | 24166 | 1.72 | 1.00 | 32.00 | 45400 | n/a | 0.963 | comparable |
| effect-fanout-body | 1024 | alien-signals 3.2.1 | 5/5 | 24321 | 0.94 | 1.00 | 32.00 | 52400 | n/a | 1.003 | comparable |
| effect-fanout-body | 1024 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 21594 | 2.73 | 1.00 | 32.00 | 64100 | n/a | 0.879 | comparable |
| effect-fanout-body | 1024 | @vue/reactivity 3.5.43 | 5/5 | 24650 | 0.51 | 1.00 | 32.00 | 46900 | n/a | 0.971 | comparable |

Cross-runtime final-checksum comparison was skipped for 30 adaptive trace group(s) with different operation counts. Every worker still passed its scenario model validation; trace lengths are retained in JSON.

Heap deltas and GC observations are diagnostics retained in JSON/CSV, not allocation measurements. Raw phase-separated work counters and failures are retained in JSON.
