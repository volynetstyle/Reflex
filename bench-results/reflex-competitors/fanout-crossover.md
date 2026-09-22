# Reflex competitor benchmark

Generated: 2026-09-22T12:41:37.602Z on v25.2.0 / 14.1.146.11-node.13

Medians are across fresh-process trials. `vs Reflex` is the median of same-trial throughput ratios; values below 1 are slower than Reflex. Ratios are withheld for failed or capability-incompatible runs.

| Scenario | Size | Framework | Trials | ops/s | MAD % | computed/op | effects/op | p99 ns | p999 ns | vs Reflex | Status |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| effect-fanout | 1 | Reflex working tree | 5/5 | 16928804 | 1.68 | 1.00 | 1.00 | 400 | n/a | 1.000 | comparable |
| effect-fanout | 1 | Reflex e87bb66 | 5/5 | 15667246 | 0.96 | 1.00 | 1.00 | 400 | n/a | 0.932 | comparable |
| effect-fanout | 1 | alien-signals 3.2.1 | 5/5 | 17761194 | 2.92 | 1.00 | 1.00 | 300 | n/a | 1.048 | comparable |
| effect-fanout | 1 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 2254080 | 0.23 | 1.00 | 1.00 | 800 | n/a | 0.135 | comparable |
| effect-fanout | 1 | @vue/reactivity 3.5.43 | 5/5 | 11900804 | 3.99 | 1.00 | 1.00 | 400 | n/a | 0.702 | comparable |
| effect-fanout | 2 | Reflex working tree | 5/5 | 10991234 | 3.73 | 1.00 | 2.00 | 400 | n/a | 1.000 | comparable |
| effect-fanout | 2 | Reflex e87bb66 | 5/5 | 10152358 | 2.84 | 1.00 | 2.00 | 400 | n/a | 0.907 | comparable |
| effect-fanout | 2 | alien-signals 3.2.1 | 5/5 | 12550060 | 2.12 | 1.00 | 2.00 | 400 | n/a | 1.142 | comparable |
| effect-fanout | 2 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 1714659 | 0.61 | 1.00 | 2.00 | 1000 | n/a | 0.159 | comparable |
| effect-fanout | 2 | @vue/reactivity 3.5.43 | 5/5 | 8553436 | 5.94 | 1.00 | 2.00 | 400 | n/a | 0.795 | comparable |
| effect-fanout | 4 | Reflex working tree | 5/5 | 6672107 | 3.12 | 1.00 | 4.00 | 500 | n/a | 1.000 | comparable |
| effect-fanout | 4 | Reflex e87bb66 | 5/5 | 6604347 | 3.97 | 1.00 | 4.00 | 500 | n/a | 0.990 | comparable |
| effect-fanout | 4 | alien-signals 3.2.1 | 5/5 | 7766246 | 0.53 | 1.00 | 4.00 | 400 | n/a | 1.194 | comparable |
| effect-fanout | 4 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 1116182 | 0.77 | 1.00 | 4.00 | 1900 | n/a | 0.167 | comparable |
| effect-fanout | 4 | @vue/reactivity 3.5.43 | 5/5 | 5943795 | 8.92 | 1.00 | 4.00 | 500 | n/a | 0.891 | comparable |
| effect-fanout | 8 | Reflex working tree | 5/5 | 3580469 | 1.60 | 1.00 | 8.00 | 600 | n/a | 1.000 | comparable |
| effect-fanout | 8 | Reflex e87bb66 | 5/5 | 3501653 | 1.11 | 1.00 | 8.00 | 600 | n/a | 0.984 | comparable |
| effect-fanout | 8 | alien-signals 3.2.1 | 5/5 | 4712249 | 0.62 | 1.00 | 8.00 | 500 | n/a | 1.324 | comparable |
| effect-fanout | 8 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 721903 | 2.91 | 1.00 | 8.00 | 2100 | n/a | 0.202 | comparable |
| effect-fanout | 8 | @vue/reactivity 3.5.43 | 5/5 | 3187273 | 3.56 | 1.00 | 8.00 | 700 | n/a | 0.893 | comparable |
| effect-fanout | 16 | Reflex working tree | 5/5 | 1927178 | 0.87 | 1.00 | 16.00 | 1000 | n/a | 1.000 | comparable |
| effect-fanout | 16 | Reflex e87bb66 | 5/5 | 1946528 | 2.50 | 1.00 | 16.00 | 900 | n/a | 1.009 | comparable |
| effect-fanout | 16 | alien-signals 3.2.1 | 5/5 | 2607214 | 0.32 | 1.00 | 16.00 | 700 | n/a | 1.315 | comparable |
| effect-fanout | 16 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 420927 | 2.97 | 1.00 | 16.00 | 3600 | n/a | 0.219 | comparable |
| effect-fanout | 16 | @vue/reactivity 3.5.43 | 5/5 | 1790627 | 4.36 | 1.00 | 16.00 | 900 | n/a | 0.917 | comparable |
| effect-fanout | 32 | Reflex working tree | 5/5 | 987904 | 4.87 | 1.00 | 32.00 | 1400 | n/a | 1.000 | comparable |
| effect-fanout | 32 | Reflex e87bb66 | 5/5 | 1040582 | 1.16 | 1.00 | 32.00 | 1500 | n/a | 1.044 | comparable |
| effect-fanout | 32 | alien-signals 3.2.1 | 5/5 | 1322338 | 0.85 | 1.00 | 32.00 | 1200 | n/a | 1.342 | comparable |
| effect-fanout | 32 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 238099 | 2.12 | 1.00 | 32.00 | 6000 | n/a | 0.235 | comparable |
| effect-fanout | 32 | @vue/reactivity 3.5.43 | 5/5 | 931059 | 1.95 | 1.00 | 32.00 | 1600 | n/a | 0.942 | comparable |
| effect-fanout | 64 | Reflex working tree | 5/5 | 523117 | 0.87 | 1.00 | 64.00 | 2700 | n/a | 1.000 | comparable |
| effect-fanout | 64 | Reflex e87bb66 | 5/5 | 510170 | 3.20 | 1.00 | 64.00 | 3100 | n/a | 0.973 | comparable |
| effect-fanout | 64 | alien-signals 3.2.1 | 5/5 | 701382 | 0.89 | 1.00 | 64.00 | 2000 | n/a | 1.352 | comparable |
| effect-fanout | 64 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 122478 | 1.92 | 1.00 | 64.00 | 10900 | n/a | 0.232 | comparable |
| effect-fanout | 64 | @vue/reactivity 3.5.43 | 5/5 | 492539 | 1.08 | 1.00 | 64.00 | 2600 | n/a | 0.976 | comparable |
| effect-fanout | 128 | Reflex working tree | 5/5 | 239067 | 5.92 | 1.00 | 128.00 | 6400 | n/a | 1.000 | comparable |
| effect-fanout | 128 | Reflex e87bb66 | 5/5 | 254533 | 3.33 | 1.00 | 128.00 | 5000 | n/a | 1.075 | comparable |
| effect-fanout | 128 | alien-signals 3.2.1 | 5/5 | 292734 | 4.59 | 1.00 | 128.00 | 4200 | n/a | 1.166 | comparable |
| effect-fanout | 128 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 63039 | 1.62 | 1.00 | 128.00 | 21200 | n/a | 0.264 | comparable |
| effect-fanout | 128 | @vue/reactivity 3.5.43 | 5/5 | 244649 | 2.11 | 1.00 | 128.00 | 5800 | n/a | 0.982 | comparable |
| effect-fanout | 256 | Reflex working tree | 5/5 | 129696 | 4.26 | 1.00 | 256.00 | 12500 | n/a | 1.000 | comparable |
| effect-fanout | 256 | Reflex e87bb66 | 5/5 | 121020 | 8.13 | 1.00 | 256.00 | 12100 | n/a | 0.933 | comparable |
| effect-fanout | 256 | alien-signals 3.2.1 | 5/5 | 131384 | 4.07 | 1.00 | 256.00 | 9800 | n/a | 0.998 | comparable |
| effect-fanout | 256 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 33104 | 2.26 | 1.00 | 256.00 | 46200 | n/a | 0.252 | comparable |
| effect-fanout | 256 | @vue/reactivity 3.5.43 | 5/5 | 127055 | 1.59 | 1.00 | 256.00 | 11900 | n/a | 0.955 | comparable |
| effect-fanout | 512 | Reflex working tree | 5/5 | 61391 | 2.90 | 1.00 | 512.00 | 27300 | n/a | 1.000 | comparable |
| effect-fanout | 512 | Reflex e87bb66 | 5/5 | 62972 | 4.81 | 1.00 | 512.00 | 23400 | n/a | 0.997 | comparable |
| effect-fanout | 512 | alien-signals 3.2.1 | 5/5 | 62251 | 2.29 | 1.00 | 512.00 | 25500 | n/a | 1.100 | comparable |
| effect-fanout | 512 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 15911 | 1.00 | 1.00 | 512.00 | 87600 | n/a | 0.261 | comparable |
| effect-fanout | 512 | @vue/reactivity 3.5.43 | 5/5 | 63904 | 3.09 | 1.00 | 512.00 | 24300 | n/a | 1.062 | comparable |
| effect-fanout | 1024 | Reflex working tree | 5/5 | 30512 | 3.34 | 1.00 | 1024.00 | 40700 | n/a | 1.000 | comparable |
| effect-fanout | 1024 | Reflex e87bb66 | 5/5 | 31076 | 1.85 | 1.00 | 1024.00 | 42900 | n/a | 1.037 | comparable |
| effect-fanout | 1024 | alien-signals 3.2.1 | 5/5 | 31448 | 2.90 | 1.00 | 1024.00 | 45600 | n/a | 1.031 | comparable |
| effect-fanout | 1024 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 7663 | 3.10 | 1.00 | 1024.00 | 175400 | n/a | 0.251 | comparable |
| effect-fanout | 1024 | @vue/reactivity 3.5.43 | 5/5 | 32211 | 1.75 | 1.00 | 1024.00 | 42400 | n/a | 1.038 | comparable |
| wide-fanout | 1 | Reflex working tree | 5/5 | 15944427 | 2.26 | 1.00 | 1.00 | 400 | n/a | 1.000 | comparable |
| wide-fanout | 1 | Reflex e87bb66 | 5/5 | 14553956 | 4.45 | 1.00 | 1.00 | 400 | n/a | 0.954 | comparable |
| wide-fanout | 1 | alien-signals 3.2.1 | 5/5 | 17184291 | 0.90 | 1.00 | 1.00 | 300 | n/a | 1.090 | comparable |
| wide-fanout | 1 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 2268718 | 1.26 | 1.00 | 1.00 | 900 | n/a | 0.142 | comparable |
| wide-fanout | 1 | @vue/reactivity 3.5.43 | 5/5 | 11470865 | 1.20 | 1.00 | 1.00 | 400 | n/a | 0.722 | comparable |
| wide-fanout | 2 | Reflex working tree | 5/5 | 8241168 | 2.49 | 2.00 | 2.00 | 400 | n/a | 1.000 | comparable |
| wide-fanout | 2 | Reflex e87bb66 | 5/5 | 8210098 | 1.64 | 2.00 | 2.00 | 500 | n/a | 1.005 | comparable |
| wide-fanout | 2 | alien-signals 3.2.1 | 5/5 | 8679339 | 2.69 | 2.00 | 2.00 | 400 | n/a | 1.085 | comparable |
| wide-fanout | 2 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 1355825 | 2.52 | 2.00 | 2.00 | 1200 | n/a | 0.164 | comparable |
| wide-fanout | 2 | @vue/reactivity 3.5.43 | 5/5 | 6093822 | 1.11 | 2.00 | 2.00 | 500 | n/a | 0.745 | comparable |
| wide-fanout | 4 | Reflex working tree | 5/5 | 4590010 | 1.04 | 4.00 | 4.00 | 600 | n/a | 1.000 | comparable |
| wide-fanout | 4 | Reflex e87bb66 | 5/5 | 4295844 | 1.60 | 4.00 | 4.00 | 600 | n/a | 0.930 | comparable |
| wide-fanout | 4 | alien-signals 3.2.1 | 5/5 | 4781367 | 1.15 | 4.00 | 4.00 | 500 | n/a | 1.037 | comparable |
| wide-fanout | 4 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 761079 | 1.25 | 4.00 | 4.00 | 2100 | n/a | 0.166 | comparable |
| wide-fanout | 4 | @vue/reactivity 3.5.43 | 5/5 | 3176492 | 0.99 | 4.00 | 4.00 | 700 | n/a | 0.693 | comparable |
| wide-fanout | 8 | Reflex working tree | 5/5 | 2368559 | 0.27 | 8.00 | 8.00 | 800 | n/a | 1.000 | comparable |
| wide-fanout | 8 | Reflex e87bb66 | 5/5 | 2366467 | 3.66 | 8.00 | 8.00 | 900 | n/a | 0.967 | comparable |
| wide-fanout | 8 | alien-signals 3.2.1 | 5/5 | 2614703 | 2.58 | 8.00 | 8.00 | 800 | n/a | 1.094 | comparable |
| wide-fanout | 8 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 417072 | 1.35 | 8.00 | 8.00 | 3500 | n/a | 0.171 | comparable |
| wide-fanout | 8 | @vue/reactivity 3.5.43 | 5/5 | 1701338 | 2.93 | 8.00 | 8.00 | 1000 | n/a | 0.702 | comparable |
| wide-fanout | 16 | Reflex working tree | 5/5 | 1234123 | 1.85 | 16.00 | 16.00 | 1200 | n/a | 1.000 | comparable |
| wide-fanout | 16 | Reflex e87bb66 | 5/5 | 1213164 | 1.82 | 16.00 | 16.00 | 1300 | n/a | 0.983 | comparable |
| wide-fanout | 16 | alien-signals 3.2.1 | 5/5 | 1263616 | 3.35 | 16.00 | 16.00 | 1200 | n/a | 1.014 | comparable |
| wide-fanout | 16 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 220603 | 2.36 | 16.00 | 16.00 | 6000 | n/a | 0.178 | comparable |
| wide-fanout | 16 | @vue/reactivity 3.5.43 | 5/5 | 867705 | 2.63 | 16.00 | 16.00 | 1700 | n/a | 0.703 | comparable |
| wide-fanout | 32 | Reflex working tree | 5/5 | 613188 | 1.78 | 32.00 | 32.00 | 2200 | n/a | 1.000 | comparable |
| wide-fanout | 32 | Reflex e87bb66 | 5/5 | 590898 | 0.19 | 32.00 | 32.00 | 2300 | n/a | 0.970 | comparable |
| wide-fanout | 32 | alien-signals 3.2.1 | 5/5 | 654256 | 1.80 | 32.00 | 32.00 | 2500 | n/a | 1.083 | comparable |
| wide-fanout | 32 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 119419 | 1.02 | 32.00 | 32.00 | 16300 | n/a | 0.191 | comparable |
| wide-fanout | 32 | @vue/reactivity 3.5.43 | 5/5 | 435165 | 0.48 | 32.00 | 32.00 | 4400 | n/a | 0.690 | comparable |
| wide-fanout | 64 | Reflex working tree | 5/5 | 311721 | 0.94 | 64.00 | 64.00 | 4400 | n/a | 1.000 | comparable |
| wide-fanout | 64 | Reflex e87bb66 | 5/5 | 278240 | 6.95 | 64.00 | 64.00 | 4700 | n/a | 0.925 | comparable |
| wide-fanout | 64 | alien-signals 3.2.1 | 5/5 | 303035 | 3.86 | 64.00 | 64.00 | 4600 | n/a | 0.977 | comparable |
| wide-fanout | 64 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 58142 | 1.39 | 64.00 | 64.00 | 24300 | n/a | 0.188 | comparable |
| wide-fanout | 64 | @vue/reactivity 3.5.43 | 5/5 | 207055 | 3.06 | 64.00 | 64.00 | 6100 | n/a | 0.672 | comparable |
| wide-fanout | 128 | Reflex working tree | 5/5 | 147243 | 2.04 | 128.00 | 128.00 | 8600 | n/a | 1.000 | comparable |
| wide-fanout | 128 | Reflex e87bb66 | 5/5 | 138164 | 6.24 | 128.00 | 128.00 | 12100 | n/a | 0.918 | comparable |
| wide-fanout | 128 | alien-signals 3.2.1 | 5/5 | 134074 | 3.96 | 128.00 | 128.00 | 11100 | n/a | 0.911 | comparable |
| wide-fanout | 128 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 29982 | 0.48 | 128.00 | 128.00 | 60400 | n/a | 0.205 | comparable |
| wide-fanout | 128 | @vue/reactivity 3.5.43 | 5/5 | 99796 | 4.71 | 128.00 | 128.00 | 14000 | n/a | 0.678 | comparable |
| wide-fanout | 256 | Reflex working tree | 5/5 | 73088 | 6.75 | 256.00 | 256.00 | 19500 | n/a | 1.000 | comparable |
| wide-fanout | 256 | Reflex e87bb66 | 5/5 | 70881 | 0.90 | 256.00 | 256.00 | 17600 | n/a | 0.979 | comparable |
| wide-fanout | 256 | alien-signals 3.2.1 | 5/5 | 65938 | 3.68 | 256.00 | 256.00 | 21900 | n/a | 0.925 | comparable |
| wide-fanout | 256 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 14425 | 2.41 | 256.00 | 256.00 | 140700 | n/a | 0.198 | comparable |
| wide-fanout | 256 | @vue/reactivity 3.5.43 | 5/5 | 47002 | 5.18 | 256.00 | 256.00 | 26300 | n/a | 0.636 | comparable |
| wide-fanout | 512 | Reflex working tree | 5/5 | 36821 | 8.09 | 512.00 | 512.00 | 53300 | n/a | 1.000 | comparable |
| wide-fanout | 512 | Reflex e87bb66 | 5/5 | 34090 | 0.69 | 512.00 | 512.00 | 42700 | n/a | 0.931 | comparable |
| wide-fanout | 512 | alien-signals 3.2.1 | 5/5 | 31347 | 5.85 | 512.00 | 512.00 | 54300 | n/a | 0.851 | comparable |
| wide-fanout | 512 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 7584 | 2.59 | 512.00 | 512.00 | 280100 | n/a | 0.206 | comparable |
| wide-fanout | 512 | @vue/reactivity 3.5.43 | 5/5 | 23831 | 7.24 | 512.00 | 512.00 | 113900 | n/a | 0.647 | comparable |
| wide-fanout | 1024 | Reflex working tree | 5/5 | 18021 | 3.99 | 1024.00 | 1024.00 | 107500 | n/a | 1.000 | comparable |
| wide-fanout | 1024 | Reflex e87bb66 | 5/5 | 16119 | 1.38 | 1024.00 | 1024.00 | 91900 | n/a | 0.943 | comparable |
| wide-fanout | 1024 | alien-signals 3.2.1 | 5/5 | 17320 | 3.13 | 1024.00 | 1024.00 | 84300 | n/a | 0.946 | comparable |
| wide-fanout | 1024 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 3725 | 5.31 | 1024.00 | 1024.00 | 376900 | n/a | 0.203 | comparable |
| wide-fanout | 1024 | @vue/reactivity 3.5.43 | 5/5 | 12713 | 2.97 | 1024.00 | 1024.00 | 107600 | n/a | 0.718 | comparable |

Cross-runtime final-checksum comparison was skipped for 110 adaptive trace group(s) with different operation counts. Every worker still passed its scenario model validation; trace lengths are retained in JSON.

Heap deltas and GC observations are diagnostics retained in JSON/CSV, not allocation measurements. Raw phase-separated work counters and failures are retained in JSON.
