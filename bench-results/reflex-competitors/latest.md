# Reflex competitor benchmark

Generated: 2026-09-22T12:20:33.649Z on v25.2.0 / 14.1.146.11-node.13

Medians are across fresh-process trials. `vs Reflex` is the median of same-trial throughput ratios; values below 1 are slower than Reflex. Ratios are withheld for failed or capability-incompatible runs.

| Scenario | Size | Framework | Trials | ops/s | MAD % | computed/op | effects/op | p99 ns | p999 ns | vs Reflex | Status |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| changed-chain | 1 | Reflex working tree | 5/5 | 17313586 | 2.25 | 1.00 | 1.00 | 300 | n/a | 1.000 | comparable |
| changed-chain | 1 | Reflex e87bb66 | 5/5 | 15980570 | 1.44 | 1.00 | 1.00 | 300 | n/a | 0.933 | comparable |
| changed-chain | 1 | alien-signals 3.2.1 | 5/5 | 16893234 | 0.76 | 1.00 | 1.00 | 400 | n/a | 0.944 | comparable |
| changed-chain | 1 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 2324411 | 1.83 | 1.00 | 1.00 | 1000 | n/a | 0.135 | comparable |
| changed-chain | 1 | @vue/reactivity 3.5.43 | 5/5 | 12235491 | 1.24 | 1.00 | 1.00 | 400 | n/a | 0.701 | comparable |
| changed-chain | 16 | Reflex working tree | 5/5 | 2363053 | 2.56 | 16.00 | 1.00 | 800 | n/a | 1.000 | comparable |
| changed-chain | 16 | Reflex e87bb66 | 5/5 | 2273252 | 2.22 | 16.00 | 1.00 | 800 | n/a | 0.966 | comparable |
| changed-chain | 16 | alien-signals 3.2.1 | 5/5 | 1922283 | 4.40 | 16.00 | 1.00 | 1100 | n/a | 0.848 | comparable |
| changed-chain | 16 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 377335 | 3.15 | 16.00 | 1.00 | 3700 | n/a | 0.158 | comparable |
| changed-chain | 16 | @vue/reactivity 3.5.43 | 5/5 | 1556457 | 3.80 | 16.00 | 1.00 | 1100 | n/a | 0.652 | comparable |
| changed-chain | 256 | Reflex working tree | 5/5 | 147129 | 0.72 | 256.00 | 1.00 | 8500 | n/a | 1.000 | comparable |
| changed-chain | 256 | Reflex e87bb66 | 5/5 | 155923 | 2.56 | 256.00 | 1.00 | 10300 | n/a | 0.985 | comparable |
| changed-chain | 256 | alien-signals 3.2.1 | 5/5 | 94708 | 6.55 | 256.00 | 1.00 | 17400 | n/a | 0.622 | comparable |
| changed-chain | 256 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 27233 | 3.43 | 256.00 | 1.00 | 62400 | n/a | 0.189 | comparable |
| changed-chain | 256 | @vue/reactivity 3.5.43 | 5/5 | 61671 | 7.82 | 256.00 | 1.00 | 16800 | n/a | 0.422 | comparable |
| changed-chain | 4096 | Reflex working tree | 5/5 | 8388 | 2.11 | 4096.00 | 1.00 | 196800 | n/a | 1.000 | comparable |
| changed-chain | 4096 | Reflex e87bb66 | 5/5 | 7973 | 2.53 | 4096.00 | 1.00 | 265100 | n/a | 0.975 | comparable |
| changed-chain | 4096 | alien-signals 3.2.1 | 5/5 | 3810 | 3.90 | 4096.00 | 1.00 | 415500 | n/a | 0.438 | comparable |
| changed-chain | 4096 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 1634 | 5.21 | 4096.00 | 1.00 | 1001600 | n/a | 0.188 | comparable |
| changed-chain | 4096 | @vue/reactivity 3.5.43 | 0/5 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | invalid: 5 failed trial(s) |
| changed-chain | 16384 | Reflex working tree | 5/5 | 1305 | 7.55 | 16384.00 | 1.00 | 1985000 | n/a | 1.000 | comparable |
| changed-chain | 16384 | Reflex e87bb66 | 5/5 | 1228 | 6.19 | 16384.00 | 1.00 | 2695000 | n/a | 0.929 | comparable |
| changed-chain | 16384 | alien-signals 3.2.1 | 5/5 | 890 | 12.53 | 16384.00 | 1.00 | 2324300 | n/a | 0.689 | comparable |
| changed-chain | 16384 | @solidjs/signals 2.0.0-rc.9 | 0/5 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | invalid: 5 failed trial(s) |
| changed-chain | 16384 | @vue/reactivity 3.5.43 | 0/5 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | invalid: 5 failed trial(s) |
| changed-leaf | 1 | Reflex working tree | 5/5 | 25534774 | 1.07 | 0.00 | 1.00 | 300 | n/a | 1.000 | comparable |
| changed-leaf | 1 | Reflex e87bb66 | 5/5 | 27133482 | 0.80 | 0.00 | 1.00 | 300 | n/a | 1.080 | comparable |
| changed-leaf | 1 | alien-signals 3.2.1 | 5/5 | 31830336 | 5.60 | 0.00 | 1.00 | 300 | n/a | 1.253 | comparable |
| changed-leaf | 1 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 3993002 | 1.61 | 0.00 | 1.00 | 600 | n/a | 0.159 | comparable |
| changed-leaf | 1 | @vue/reactivity 3.5.43 | 5/5 | 24594073 | 2.07 | 0.00 | 1.00 | 300 | n/a | 0.980 | comparable |
| clean-edge | 1 | Reflex working tree | 5/5 | 433837888 | 1.53 | 0.00 | 0.00 | 200 | n/a | 1.000 | comparable |
| clean-edge | 1 | Reflex e87bb66 | 5/5 | 432608320 | 1.46 | 0.00 | 0.00 | 200 | n/a | 0.993 | comparable |
| clean-edge | 1 | alien-signals 3.2.1 | 5/5 | 370041152 | 1.77 | 0.00 | 0.00 | 200 | n/a | 0.861 | comparable |
| clean-edge | 1 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 83249405 | 2.18 | 0.00 | 0.00 | 300 | n/a | 0.190 | comparable |
| clean-edge | 1 | @vue/reactivity 3.5.43 | 5/5 | 284991124 | 1.43 | 0.00 | 0.00 | 200 | n/a | 0.657 | comparable |
| clean-edge | 16 | Reflex working tree | 5/5 | 434475072 | 2.67 | 0.00 | 0.00 | 200 | n/a | 1.000 | comparable |
| clean-edge | 16 | Reflex e87bb66 | 5/5 | 436430400 | 2.11 | 0.00 | 0.00 | 300 | n/a | 1.000 | comparable |
| clean-edge | 16 | alien-signals 3.2.1 | 5/5 | 369853760 | 1.60 | 0.00 | 0.00 | 200 | n/a | 0.854 | comparable |
| clean-edge | 16 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 75457193 | 0.43 | 0.00 | 0.00 | 300 | n/a | 0.172 | comparable |
| clean-edge | 16 | @vue/reactivity 3.5.43 | 5/5 | 204370158 | 1.21 | 0.00 | 0.00 | 300 | n/a | 0.475 | comparable |
| clean-edge | 256 | Reflex working tree | 5/5 | 420751000 | 5.38 | 0.00 | 0.00 | 200 | n/a | 1.000 | comparable |
| clean-edge | 256 | Reflex e87bb66 | 5/5 | 419882648 | 5.87 | 0.00 | 0.00 | 200 | n/a | 1.009 | comparable |
| clean-edge | 256 | alien-signals 3.2.1 | 5/5 | 369972288 | 2.70 | 0.00 | 0.00 | 200 | n/a | 0.864 | comparable |
| clean-edge | 256 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 76399180 | 0.27 | 0.00 | 0.00 | 300 | n/a | 0.182 | comparable |
| clean-edge | 256 | @vue/reactivity 3.5.43 | 5/5 | 204323485 | 2.16 | 0.00 | 0.00 | 300 | n/a | 0.481 | comparable |
| clean-edge | 4096 | Reflex working tree | 5/5 | 261602007 | 0.84 | 0.00 | 0.00 | 200 | n/a | 1.000 | comparable |
| clean-edge | 4096 | Reflex e87bb66 | 5/5 | 293843658 | 1.43 | 0.00 | 0.00 | 200 | n/a | 1.118 | comparable |
| clean-edge | 4096 | alien-signals 3.2.1 | 5/5 | 280011072 | 1.09 | 0.00 | 0.00 | 200 | n/a | 1.053 | comparable |
| clean-edge | 4096 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 62322065 | 2.77 | 0.00 | 0.00 | 300 | n/a | 0.242 | comparable |
| clean-edge | 4096 | @vue/reactivity 3.5.43 | 5/5 | 203206813 | 0.46 | 0.00 | 0.00 | 300 | n/a | 0.770 | comparable |
| deep-unknown | 1 | Reflex working tree | 5/5 | 21767913 | 0.40 | 1.00 | 0.00 | 300 | n/a | 1.000 | comparable |
| deep-unknown | 1 | Reflex e87bb66 | 5/5 | 21677476 | 1.78 | 1.00 | 0.00 | 300 | n/a | 1.013 | comparable |
| deep-unknown | 1 | alien-signals 3.2.1 | 5/5 | 19819001 | 0.78 | 1.00 | 0.00 | 300 | n/a | 0.944 | comparable |
| deep-unknown | 1 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 5421196 | 3.78 | 1.00 | 0.00 | 600 | n/a | 0.251 | comparable |
| deep-unknown | 1 | @vue/reactivity 3.5.43 | 5/5 | 16453571 | 0.82 | 1.00 | 0.00 | 300 | n/a | 0.762 | comparable |
| deep-unknown | 16 | Reflex working tree | 5/5 | 6250005 | 2.57 | 1.00 | 0.00 | 500 | n/a | 1.000 | comparable |
| deep-unknown | 16 | Reflex e87bb66 | 5/5 | 5867582 | 2.66 | 1.00 | 0.00 | 500 | n/a | 0.939 | comparable |
| deep-unknown | 16 | alien-signals 3.2.1 | 5/5 | 3763838 | 6.62 | 1.00 | 0.00 | 700 | n/a | 0.602 | comparable |
| deep-unknown | 16 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 4072397 | 2.03 | 1.00 | 0.00 | 700 | n/a | 0.655 | comparable |
| deep-unknown | 16 | @vue/reactivity 3.5.43 | 5/5 | 3166087 | 2.93 | 1.00 | 0.00 | 1100 | n/a | 0.513 | comparable |
| deep-unknown | 256 | Reflex working tree | 5/5 | 386064 | 11.14 | 1.00 | 0.00 | 4300 | n/a | 1.000 | comparable |
| deep-unknown | 256 | Reflex e87bb66 | 5/5 | 408835 | 4.87 | 1.00 | 0.00 | 3800 | n/a | 1.037 | comparable |
| deep-unknown | 256 | alien-signals 3.2.1 | 5/5 | 173067 | 1.09 | 1.00 | 0.00 | 16000 | n/a | 0.487 | comparable |
| deep-unknown | 256 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 4471129 | 3.67 | 1.00 | 0.00 | 600 | n/a | 10.803 | comparable |
| deep-unknown | 256 | @vue/reactivity 3.5.43 | 5/5 | 124698 | 14.98 | 1.00 | 0.00 | 15200 | n/a | 0.309 | comparable |
| deep-unknown | 4096 | Reflex working tree | 5/5 | 20908 | 7.70 | 1.00 | 0.00 | 115400 | n/a | 1.000 | comparable |
| deep-unknown | 4096 | Reflex e87bb66 | 5/5 | 18682 | 7.27 | 1.00 | 0.00 | 122800 | n/a | 0.894 | comparable |
| deep-unknown | 4096 | alien-signals 3.2.1 | 5/5 | 5680 | 9.48 | 1.00 | 0.00 | 312400 | n/a | 0.288 | comparable |
| deep-unknown | 4096 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 4304170 | 0.54 | 1.00 | 0.00 | 600 | n/a | 205.752 | comparable |
| deep-unknown | 4096 | @vue/reactivity 3.5.43 | 0/5 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | invalid: 5 failed trial(s) |
| diamond-fan-in | 2 | Reflex working tree | 5/5 | 7674343 | 4.84 | 3.00 | 1.00 | 500 | n/a | 1.000 | comparable |
| diamond-fan-in | 2 | Reflex e87bb66 | 5/5 | 7037946 | 2.45 | 3.00 | 1.00 | 600 | n/a | 0.948 | comparable |
| diamond-fan-in | 2 | alien-signals 3.2.1 | 5/5 | 8803160 | 2.38 | 3.00 | 1.00 | 400 | n/a | 1.186 | comparable |
| diamond-fan-in | 2 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 1272047 | 1.85 | 3.00 | 1.00 | 1300 | n/a | 0.169 | comparable |
| diamond-fan-in | 2 | @vue/reactivity 3.5.43 | 5/5 | 4963100 | 2.66 | 3.00 | 1.00 | 500 | n/a | 0.647 | comparable |
| diamond-fan-in | 16 | Reflex working tree | 5/5 | 1903986 | 3.38 | 17.00 | 1.00 | 900 | n/a | 1.000 | comparable |
| diamond-fan-in | 16 | Reflex e87bb66 | 5/5 | 1927186 | 0.83 | 17.00 | 1.00 | 900 | n/a | 1.031 | comparable |
| diamond-fan-in | 16 | alien-signals 3.2.1 | 5/5 | 2196619 | 3.52 | 17.00 | 1.00 | 1000 | n/a | 1.170 | comparable |
| diamond-fan-in | 16 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 313406 | 1.04 | 17.00 | 1.00 | 4600 | n/a | 0.169 | comparable |
| diamond-fan-in | 16 | @vue/reactivity 3.5.43 | 5/5 | 972739 | 2.71 | 17.00 | 1.00 | 1500 | n/a | 0.518 | comparable |
| diamond-fan-in | 256 | Reflex working tree | 5/5 | 125808 | 2.81 | 257.00 | 1.00 | 9900 | n/a | 1.000 | comparable |
| diamond-fan-in | 256 | Reflex e87bb66 | 5/5 | 130798 | 4.71 | 257.00 | 1.00 | 9200 | n/a | 0.976 | comparable |
| diamond-fan-in | 256 | alien-signals 3.2.1 | 5/5 | 130367 | 7.15 | 257.00 | 1.00 | 10400 | n/a | 1.036 | comparable |
| diamond-fan-in | 256 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 25876 | 0.92 | 257.00 | 1.00 | 77400 | n/a | 0.197 | comparable |
| diamond-fan-in | 256 | @vue/reactivity 3.5.43 | 5/5 | 64768 | 3.77 | 257.00 | 1.00 | 21800 | n/a | 0.487 | comparable |
| diamond-fan-in | 1024 | Reflex working tree | 5/5 | 29822 | 4.82 | 1025.00 | 1.00 | 88800 | n/a | 1.000 | comparable |
| diamond-fan-in | 1024 | Reflex e87bb66 | 5/5 | 31758 | 4.83 | 1025.00 | 1.00 | 54900 | n/a | 1.065 | comparable |
| diamond-fan-in | 1024 | alien-signals 3.2.1 | 5/5 | 34507 | 2.23 | 1025.00 | 1.00 | 40200 | n/a | 1.124 | comparable |
| diamond-fan-in | 1024 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 6644 | 0.99 | 1025.00 | 1.00 | 256900 | n/a | 0.213 | comparable |
| diamond-fan-in | 1024 | @vue/reactivity 3.5.43 | 5/5 | 16102 | 0.86 | 1025.00 | 1.00 | 86600 | n/a | 0.535 | comparable |
| dynamic-branch | 2 | Reflex working tree | 5/5 | 7373487 | 0.57 | 1.00 | 1.00 | 500 | n/a | 1.000 | comparable |
| dynamic-branch | 2 | Reflex e87bb66 | 5/5 | 6891193 | 1.96 | 1.00 | 1.00 | 500 | n/a | 0.945 | comparable |
| dynamic-branch | 2 | alien-signals 3.2.1 | 5/5 | 5162213 | 3.49 | 1.00 | 1.00 | 500 | n/a | 0.686 | comparable |
| dynamic-branch | 2 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 1732603 | 1.01 | 1.00 | 1.00 | 1100 | n/a | 0.234 | comparable |
| dynamic-branch | 2 | @vue/reactivity 3.5.43 | 5/5 | 5203874 | 2.29 | 1.00 | 1.00 | 600 | n/a | 0.698 | comparable |
| dynamic-branch | 16 | Reflex working tree | 5/5 | 7282327 | 8.89 | 1.00 | 1.00 | 500 | n/a | 1.000 | comparable |
| dynamic-branch | 16 | Reflex e87bb66 | 5/5 | 6600388 | 7.69 | 1.00 | 1.00 | 500 | n/a | 0.967 | comparable |
| dynamic-branch | 16 | alien-signals 3.2.1 | 5/5 | 5290490 | 5.93 | 1.00 | 1.00 | 500 | n/a | 0.769 | comparable |
| dynamic-branch | 16 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 1790883 | 3.58 | 1.00 | 1.00 | 1100 | n/a | 0.244 | comparable |
| dynamic-branch | 16 | @vue/reactivity 3.5.43 | 5/5 | 5562982 | 1.96 | 1.00 | 1.00 | 500 | n/a | 0.787 | comparable |
| dynamic-branch | 256 | Reflex working tree | 5/5 | 7395592 | 7.18 | 1.00 | 1.00 | 500 | n/a | 1.000 | comparable |
| dynamic-branch | 256 | Reflex e87bb66 | 5/5 | 7349094 | 2.28 | 1.00 | 1.00 | 500 | n/a | 1.028 | comparable |
| dynamic-branch | 256 | alien-signals 3.2.1 | 5/5 | 5669164 | 1.45 | 1.00 | 1.00 | 600 | n/a | 0.767 | comparable |
| dynamic-branch | 256 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 1734320 | 3.32 | 1.00 | 1.00 | 1100 | n/a | 0.235 | comparable |
| dynamic-branch | 256 | @vue/reactivity 3.5.43 | 5/5 | 5443975 | 2.23 | 1.00 | 1.00 | 500 | n/a | 0.753 | comparable |
| dynamic-branch | 1024 | Reflex working tree | 5/5 | 7124942 | 3.86 | 1.00 | 1.00 | 500 | n/a | 1.000 | comparable |
| dynamic-branch | 1024 | Reflex e87bb66 | 5/5 | 7186096 | 4.08 | 1.00 | 1.00 | 500 | n/a | 1.031 | comparable |
| dynamic-branch | 1024 | alien-signals 3.2.1 | 5/5 | 5479353 | 7.13 | 1.00 | 1.00 | 700 | n/a | 0.774 | comparable |
| dynamic-branch | 1024 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 1741803 | 1.61 | 1.00 | 1.00 | 1100 | n/a | 0.238 | comparable |
| dynamic-branch | 1024 | @vue/reactivity 3.5.43 | 5/5 | 5559427 | 1.23 | 1.00 | 1.00 | 500 | n/a | 0.790 | comparable |
| effect-fanout | 1 | Reflex working tree | 5/5 | 16964301 | 0.96 | 1.00 | 1.00 | 300 | n/a | 1.000 | comparable |
| effect-fanout | 1 | Reflex e87bb66 | 5/5 | 16291767 | 1.24 | 1.00 | 1.00 | 400 | n/a | 0.951 | comparable |
| effect-fanout | 1 | alien-signals 3.2.1 | 5/5 | 17852693 | 3.62 | 1.00 | 1.00 | 300 | n/a | 1.058 | comparable |
| effect-fanout | 1 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 2347048 | 1.03 | 1.00 | 1.00 | 900 | n/a | 0.139 | comparable |
| effect-fanout | 1 | @vue/reactivity 3.5.43 | 5/5 | 12216198 | 3.20 | 1.00 | 1.00 | 400 | n/a | 0.724 | comparable |
| effect-fanout | 16 | Reflex working tree | 5/5 | 1905640 | 2.51 | 1.00 | 16.00 | 900 | n/a | 1.000 | comparable |
| effect-fanout | 16 | Reflex e87bb66 | 5/5 | 1912162 | 2.37 | 1.00 | 16.00 | 900 | n/a | 1.010 | comparable |
| effect-fanout | 16 | alien-signals 3.2.1 | 5/5 | 2472661 | 5.80 | 1.00 | 16.00 | 800 | n/a | 1.265 | comparable |
| effect-fanout | 16 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 417232 | 2.57 | 1.00 | 16.00 | 3300 | n/a | 0.213 | comparable |
| effect-fanout | 16 | @vue/reactivity 3.5.43 | 5/5 | 1803099 | 0.26 | 1.00 | 16.00 | 1000 | n/a | 0.929 | comparable |
| effect-fanout | 256 | Reflex working tree | 5/5 | 127296 | 6.71 | 1.00 | 256.00 | 9200 | n/a | 1.000 | comparable |
| effect-fanout | 256 | Reflex e87bb66 | 5/5 | 111071 | 3.42 | 1.00 | 256.00 | 10900 | n/a | 0.921 | comparable |
| effect-fanout | 256 | alien-signals 3.2.1 | 5/5 | 127287 | 1.41 | 1.00 | 256.00 | 10500 | n/a | 1.025 | comparable |
| effect-fanout | 256 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 30708 | 1.97 | 1.00 | 256.00 | 44900 | n/a | 0.258 | comparable |
| effect-fanout | 256 | @vue/reactivity 3.5.43 | 5/5 | 128353 | 2.34 | 1.00 | 256.00 | 8900 | n/a | 0.978 | comparable |
| effect-fanout | 1024 | Reflex working tree | 5/5 | 31956 | 6.42 | 1.00 | 1024.00 | 38600 | n/a | 1.000 | comparable |
| effect-fanout | 1024 | Reflex e87bb66 | 5/5 | 30790 | 5.70 | 1.00 | 1024.00 | 40400 | n/a | 1.018 | comparable |
| effect-fanout | 1024 | alien-signals 3.2.1 | 5/5 | 32688 | 4.97 | 1.00 | 1024.00 | 39500 | n/a | 1.019 | comparable |
| effect-fanout | 1024 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 8039 | 3.17 | 1.00 | 1024.00 | 194200 | n/a | 0.253 | comparable |
| effect-fanout | 1024 | @vue/reactivity 3.5.43 | 5/5 | 31568 | 4.28 | 1.00 | 1024.00 | 42100 | n/a | 0.968 | comparable |
| equal-leaf | 1 | Reflex working tree | 5/5 | 105316374 | 3.35 | 0.00 | 0.00 | 300 | n/a | 1.000 | comparable |
| equal-leaf | 1 | Reflex e87bb66 | 5/5 | 108084757 | 1.91 | 0.00 | 0.00 | 200 | n/a | 1.016 | comparable |
| equal-leaf | 1 | alien-signals 3.2.1 | 5/5 | 186594219 | 2.28 | 0.00 | 0.00 | 300 | n/a | 1.750 | comparable |
| equal-leaf | 1 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 71768781 | 5.69 | 0.00 | 0.00 | 300 | n/a | 0.681 | comparable |
| equal-leaf | 1 | @vue/reactivity 3.5.43 | 5/5 | 564992832 | 1.79 | 0.00 | 0.00 | 200 | n/a | 5.365 | comparable |
| failure-retry | 1 | Reflex working tree | 5/5 | 99422 | 9.57 | 2.00 | 0.00 | 16200 | n/a | 1.000 | comparable |
| failure-retry | 1 | Reflex e87bb66 | 5/5 | 119022 | 4.90 | 2.00 | 0.00 | 11700 | n/a | 1.230 | comparable |
| failure-retry | 1 | alien-signals 3.2.1 | 5/5 | 135514 | 3.94 | 2.00 | 0.00 | 16200 | n/a | 1.164 | comparable |
| failure-retry | 1 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 29078 | 1.43 | 2.00 | 0.00 | 51000 | n/a | 0.253 | comparable |
| failure-retry | 1 | @vue/reactivity 3.5.43 | 5/5 | 99664 | 3.76 | 2.00 | 0.00 | 12100 | n/a | 1.024 | comparable |
| failure-retry | 16 | Reflex working tree | 5/5 | 75039 | 7.53 | 17.00 | 0.00 | 18200 | n/a | 1.000 | comparable |
| failure-retry | 16 | Reflex e87bb66 | 5/5 | 95848 | 1.57 | 17.00 | 0.00 | 14200 | n/a | 1.224 | comparable |
| failure-retry | 16 | alien-signals 3.2.1 | 5/5 | 83846 | 7.29 | 17.00 | 0.00 | 17500 | n/a | 1.202 | comparable |
| failure-retry | 16 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 23072 | 3.20 | 17.00 | 0.00 | 62600 | n/a | 0.322 | comparable |
| failure-retry | 16 | @vue/reactivity 3.5.43 | 5/5 | 53693 | 3.64 | 17.00 | 0.00 | 25100 | n/a | 0.695 | comparable |
| failure-retry | 256 | Reflex working tree | 5/5 | 42950 | 5.39 | 257.00 | 0.00 | 35600 | n/a | 1.000 | comparable |
| failure-retry | 256 | Reflex e87bb66 | 5/5 | 52055 | 6.27 | 257.00 | 0.00 | 30700 | n/a | 1.143 | comparable |
| failure-retry | 256 | alien-signals 3.2.1 | 5/5 | 46300 | 1.69 | 257.00 | 0.00 | 41000 | n/a | 1.084 | comparable |
| failure-retry | 256 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 11626 | 3.63 | 257.00 | 0.00 | 182200 | n/a | 0.265 | comparable |
| failure-retry | 256 | @vue/reactivity 3.5.43 | 5/5 | 26892 | 4.44 | 257.00 | 0.00 | 48300 | n/a | 0.626 | comparable |
| failure-retry | 1024 | Reflex working tree | 5/5 | 20726 | 1.24 | 1025.00 | 0.00 | 120400 | n/a | 1.000 | comparable |
| failure-retry | 1024 | Reflex e87bb66 | 5/5 | 21491 | 7.76 | 1025.00 | 0.00 | 115800 | n/a | 1.124 | comparable |
| failure-retry | 1024 | alien-signals 3.2.1 | 5/5 | 22007 | 4.61 | 1025.00 | 0.00 | 121200 | n/a | 1.111 | comparable |
| failure-retry | 1024 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 3901 | 5.41 | 1025.00 | 0.00 | 389300 | n/a | 0.192 | comparable |
| failure-retry | 1024 | @vue/reactivity 3.5.43 | 5/5 | 10894 | 1.68 | 1025.00 | 0.00 | 122900 | n/a | 0.526 | comparable |
| layered-dag | 2 | Reflex working tree | 5/5 | 1421951 | 1.64 | 17.00 | 1.00 | 1100 | n/a | 1.000 | comparable |
| layered-dag | 2 | Reflex e87bb66 | 5/5 | 1518058 | 2.42 | 17.00 | 1.00 | 1100 | n/a | 1.083 | comparable |
| layered-dag | 2 | alien-signals 3.2.1 | 5/5 | 1473699 | 4.64 | 17.00 | 1.00 | 1400 | n/a | 1.036 | comparable |
| layered-dag | 2 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 266760 | 1.92 | 17.00 | 1.00 | 7300 | n/a | 0.190 | comparable |
| layered-dag | 2 | @vue/reactivity 3.5.43 | 5/5 | 813778 | 4.62 | 17.00 | 1.00 | 1600 | n/a | 0.605 | comparable |
| layered-dag | 8 | Reflex working tree | 5/5 | 393377 | 0.62 | 65.00 | 1.00 | 4800 | n/a | 1.000 | comparable |
| layered-dag | 8 | Reflex e87bb66 | 5/5 | 347525 | 14.51 | 65.00 | 1.00 | 4000 | n/a | 0.889 | comparable |
| layered-dag | 8 | alien-signals 3.2.1 | 5/5 | 372144 | 2.52 | 65.00 | 1.00 | 3500 | n/a | 0.952 | comparable |
| layered-dag | 8 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 71870 | 3.45 | 65.00 | 1.00 | 15700 | n/a | 0.183 | comparable |
| layered-dag | 8 | @vue/reactivity 3.5.43 | 5/5 | 220452 | 0.51 | 65.00 | 1.00 | 7700 | n/a | 0.557 | comparable |
| layered-dag | 32 | Reflex working tree | 5/5 | 84689 | 2.11 | 257.00 | 1.00 | 16800 | n/a | 1.000 | comparable |
| layered-dag | 32 | Reflex e87bb66 | 5/5 | 84752 | 2.48 | 257.00 | 1.00 | 15200 | n/a | 0.995 | comparable |
| layered-dag | 32 | alien-signals 3.2.1 | 5/5 | 79322 | 0.20 | 257.00 | 1.00 | 21000 | n/a | 0.937 | comparable |
| layered-dag | 32 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 19965 | 3.74 | 257.00 | 1.00 | 69300 | n/a | 0.245 | comparable |
| layered-dag | 32 | @vue/reactivity 3.5.43 | 5/5 | 49342 | 1.11 | 257.00 | 1.00 | 24000 | n/a | 0.583 | comparable |
| layered-dag | 128 | Reflex working tree | 5/5 | 18694 | 3.16 | 1025.00 | 1.00 | 75100 | n/a | 1.000 | comparable |
| layered-dag | 128 | Reflex e87bb66 | 5/5 | 19711 | 1.32 | 1025.00 | 1.00 | 68100 | n/a | 1.045 | comparable |
| layered-dag | 128 | alien-signals 3.2.1 | 5/5 | 19549 | 5.24 | 1025.00 | 1.00 | 123100 | n/a | 1.080 | comparable |
| layered-dag | 128 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 5116 | 5.40 | 1025.00 | 1.00 | 380400 | n/a | 0.274 | comparable |
| layered-dag | 128 | @vue/reactivity 3.5.43 | 5/5 | 11893 | 1.17 | 1025.00 | 1.00 | 116900 | n/a | 0.649 | comparable |
| lifecycle-churn | 1 | Reflex working tree | 5/5 | 1415323 | 5.55 | 0.00 | 2.00 | 1800 | n/a | 1.000 | comparable |
| lifecycle-churn | 1 | Reflex e87bb66 | 5/5 | 1473634 | 0.85 | 0.00 | 2.00 | 1300 | n/a | 1.020 | comparable |
| lifecycle-churn | 1 | alien-signals 3.2.1 | 5/5 | 2057065 | 1.29 | 0.00 | 2.00 | 1100 | n/a | 1.472 | comparable |
| lifecycle-churn | 1 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 687492 | 1.12 | 0.00 | 2.00 | 2200 | n/a | 0.492 | comparable |
| lifecycle-churn | 1 | @vue/reactivity 3.5.43 | 5/5 | 1883354 | 2.31 | 0.00 | 2.00 | 1600 | n/a | 1.323 | comparable |
| lifecycle-churn | 16 | Reflex working tree | 5/5 | 191472 | 6.74 | 0.00 | 32.00 | 4400 | n/a | 1.000 | comparable |
| lifecycle-churn | 16 | Reflex e87bb66 | 5/5 | 207371 | 0.90 | 0.00 | 32.00 | 3700 | n/a | 1.076 | comparable |
| lifecycle-churn | 16 | alien-signals 3.2.1 | 5/5 | 402964 | 1.90 | 0.00 | 32.00 | 3700 | n/a | 2.024 | comparable |
| lifecycle-churn | 16 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 115897 | 4.23 | 0.00 | 32.00 | 19900 | n/a | 0.585 | comparable |
| lifecycle-churn | 16 | @vue/reactivity 3.5.43 | 5/5 | 305057 | 1.22 | 0.00 | 32.00 | 5200 | n/a | 1.568 | comparable |
| lifecycle-churn | 128 | Reflex working tree | 5/5 | 29413 | 3.29 | 0.00 | 256.00 | 36400 | n/a | 1.000 | comparable |
| lifecycle-churn | 128 | Reflex e87bb66 | 5/5 | 31792 | 0.49 | 0.00 | 256.00 | 30600 | n/a | 1.081 | comparable |
| lifecycle-churn | 128 | alien-signals 3.2.1 | 5/5 | 64255 | 4.12 | 0.00 | 256.00 | 38800 | n/a | 2.166 | comparable |
| lifecycle-churn | 128 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 16931 | 0.81 | 0.00 | 256.00 | 203900 | n/a | 0.570 | comparable |
| lifecycle-churn | 128 | @vue/reactivity 3.5.43 | 5/5 | 48506 | 2.72 | 0.00 | 256.00 | 71000 | n/a | 1.694 | comparable |
| lifecycle-churn | 512 | Reflex working tree | 5/5 | 7764 | 2.22 | 0.00 | 1024.00 | 307500 | n/a | 1.000 | comparable |
| lifecycle-churn | 512 | Reflex e87bb66 | 5/5 | 7818 | 3.45 | 0.00 | 1024.00 | 315300 | n/a | 1.006 | comparable |
| lifecycle-churn | 512 | alien-signals 3.2.1 | 5/5 | 15699 | 4.28 | 0.00 | 1024.00 | 255100 | n/a | 2.035 | comparable |
| lifecycle-churn | 512 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 4435 | 3.66 | 0.00 | 1024.00 | 553500 | n/a | 0.568 | comparable |
| lifecycle-churn | 512 | @vue/reactivity 3.5.43 | 5/5 | 11757 | 0.43 | 0.00 | 1024.00 | 242600 | n/a | 1.557 | comparable |
| mostly-dirty | 16 | Reflex working tree | 5/5 | 2527858 | 1.16 | 1.00 | 1.00 | 900 | n/a | 1.000 | comparable |
| mostly-dirty | 16 | Reflex e87bb66 | 5/5 | 2460215 | 0.45 | 1.00 | 1.00 | 800 | n/a | 0.978 | comparable |
| mostly-dirty | 16 | alien-signals 3.2.1 | 5/5 | 2535134 | 1.50 | 1.00 | 1.00 | 800 | n/a | 1.003 | comparable |
| mostly-dirty | 16 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 807235 | 0.55 | 1.00 | 1.00 | 2100 | n/a | 0.317 | comparable |
| mostly-dirty | 16 | @vue/reactivity 3.5.43 | 5/5 | 211631 | 2.48 | 12.00 | 12.00 | 5600 | n/a | n/a | not comparable: Scenario requires publicBatch for equal public observable work |
| mostly-dirty | 256 | Reflex working tree | 5/5 | 161674 | 3.45 | 1.00 | 1.00 | 8300 | n/a | 1.000 | comparable |
| mostly-dirty | 256 | Reflex e87bb66 | 5/5 | 166677 | 2.13 | 1.00 | 1.00 | 8100 | n/a | 1.053 | comparable |
| mostly-dirty | 256 | alien-signals 3.2.1 | 5/5 | 172820 | 6.36 | 1.00 | 1.00 | 7000 | n/a | 1.123 | comparable |
| mostly-dirty | 256 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 75352 | 1.48 | 1.00 | 1.00 | 20600 | n/a | 0.445 | comparable |
| mostly-dirty | 256 | @vue/reactivity 3.5.43 | 5/5 | 859 | 9.72 | 192.00 | 192.00 | 1746900 | n/a | n/a | not comparable: Scenario requires publicBatch for equal public observable work |
| mostly-dirty | 1024 | Reflex working tree | 5/5 | 40091 | 7.09 | 1.00 | 1.00 | 47800 | n/a | 1.000 | comparable |
| mostly-dirty | 1024 | Reflex e87bb66 | 5/5 | 42425 | 2.60 | 1.00 | 1.00 | 41100 | n/a | 0.988 | comparable |
| mostly-dirty | 1024 | alien-signals 3.2.1 | 5/5 | 43030 | 2.00 | 1.00 | 1.00 | 39700 | n/a | 1.002 | comparable |
| mostly-dirty | 1024 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 17427 | 7.45 | 1.00 | 1.00 | 85400 | n/a | 0.399 | comparable |
| mostly-dirty | 1024 | @vue/reactivity 3.5.43 | 0/5 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | invalid: 5 failed trial(s) |
| reorder-dependencies | 8 | Reflex working tree | 5/5 | 7090937 | 2.35 | 1.00 | 1.00 | 500 | n/a | 1.000 | comparable |
| reorder-dependencies | 8 | Reflex e87bb66 | 5/5 | 6665357 | 3.02 | 1.00 | 1.00 | 500 | n/a | 0.937 | comparable |
| reorder-dependencies | 8 | alien-signals 3.2.1 | 5/5 | 1317839 | 2.24 | 1.00 | 1.00 | 800 | n/a | 0.195 | comparable |
| reorder-dependencies | 8 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 741457 | 0.44 | 1.00 | 1.00 | 4000 | n/a | 0.105 | comparable |
| reorder-dependencies | 8 | @vue/reactivity 3.5.43 | 5/5 | 4183593 | 0.93 | 1.00 | 1.00 | 600 | n/a | 0.595 | comparable |
| reorder-dependencies | 64 | Reflex working tree | 5/5 | 1394369 | 6.13 | 1.00 | 1.00 | 1200 | n/a | 1.000 | comparable |
| reorder-dependencies | 64 | Reflex e87bb66 | 5/5 | 1374411 | 1.56 | 1.00 | 1.00 | 1200 | n/a | 1.001 | comparable |
| reorder-dependencies | 64 | alien-signals 3.2.1 | 5/5 | 179672 | 5.57 | 1.00 | 1.00 | 4600 | n/a | 0.126 | comparable |
| reorder-dependencies | 64 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 141818 | 4.12 | 1.00 | 1.00 | 5700 | n/a | 0.096 | comparable |
| reorder-dependencies | 64 | @vue/reactivity 3.5.43 | 5/5 | 789795 | 1.99 | 1.00 | 1.00 | 1800 | n/a | 0.561 | comparable |
| reorder-dependencies | 512 | Reflex working tree | 5/5 | 153936 | 9.71 | 1.00 | 1.00 | 10300 | n/a | 1.000 | comparable |
| reorder-dependencies | 512 | Reflex e87bb66 | 5/5 | 174904 | 2.65 | 1.00 | 1.00 | 8100 | n/a | 1.041 | comparable |
| reorder-dependencies | 512 | alien-signals 3.2.1 | 5/5 | 27381 | 5.74 | 1.00 | 1.00 | 30200 | n/a | 0.189 | comparable |
| reorder-dependencies | 512 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 25138 | 0.16 | 1.00 | 1.00 | 43700 | n/a | 0.163 | comparable |
| reorder-dependencies | 512 | @vue/reactivity 3.5.43 | 5/5 | 87610 | 9.79 | 1.00 | 1.00 | 17700 | n/a | 0.495 | comparable |
| reorder-dependencies | 2048 | Reflex working tree | 5/5 | 28075 | 13.13 | 1.00 | 1.00 | 52600 | n/a | 1.000 | comparable |
| reorder-dependencies | 2048 | Reflex e87bb66 | 5/5 | 35862 | 2.49 | 1.00 | 1.00 | 45400 | n/a | 1.135 | comparable |
| reorder-dependencies | 2048 | alien-signals 3.2.1 | 5/5 | 6481 | 4.16 | 1.00 | 1.00 | 161500 | n/a | 0.212 | comparable |
| reorder-dependencies | 2048 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 5912 | 0.64 | 1.00 | 1.00 | 176100 | n/a | 0.210 | comparable |
| reorder-dependencies | 2048 | @vue/reactivity 3.5.43 | 5/5 | 21674 | 4.20 | 1.00 | 1.00 | 115900 | n/a | 0.657 | comparable |
| selective-update | 16 | Reflex working tree | 5/5 | 4204088 | 1.16 | 2.00 | 1.00 | 600 | n/a | 1.000 | comparable |
| selective-update | 16 | Reflex e87bb66 | 5/5 | 4106837 | 1.50 | 2.00 | 1.00 | 600 | n/a | 0.966 | comparable |
| selective-update | 16 | alien-signals 3.2.1 | 5/5 | 4149188 | 2.48 | 2.00 | 1.00 | 600 | n/a | 0.991 | comparable |
| selective-update | 16 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 833478 | 2.87 | 2.00 | 1.00 | 1900 | n/a | 0.196 | comparable |
| selective-update | 16 | @vue/reactivity 3.5.43 | 5/5 | 2153572 | 2.45 | 2.00 | 1.00 | 900 | n/a | 0.517 | comparable |
| selective-update | 256 | Reflex working tree | 5/5 | 448257 | 5.75 | 2.00 | 1.00 | 4300 | n/a | 1.000 | comparable |
| selective-update | 256 | Reflex e87bb66 | 5/5 | 434925 | 0.36 | 2.00 | 1.00 | 4200 | n/a | 0.970 | comparable |
| selective-update | 256 | alien-signals 3.2.1 | 5/5 | 421154 | 2.87 | 2.00 | 1.00 | 3600 | n/a | 0.966 | comparable |
| selective-update | 256 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 105747 | 3.59 | 2.00 | 1.00 | 11200 | n/a | 0.233 | comparable |
| selective-update | 256 | @vue/reactivity 3.5.43 | 5/5 | 162771 | 2.57 | 2.00 | 1.00 | 7700 | n/a | 0.367 | comparable |
| selective-update | 1024 | Reflex working tree | 5/5 | 115555 | 3.91 | 2.00 | 1.00 | 11100 | n/a | 1.000 | comparable |
| selective-update | 1024 | Reflex e87bb66 | 5/5 | 110063 | 4.18 | 2.00 | 1.00 | 14200 | n/a | 0.944 | comparable |
| selective-update | 1024 | alien-signals 3.2.1 | 5/5 | 108935 | 0.13 | 2.00 | 1.00 | 14900 | n/a | 0.949 | comparable |
| selective-update | 1024 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 27590 | 3.38 | 2.00 | 1.00 | 54600 | n/a | 0.232 | comparable |
| selective-update | 1024 | @vue/reactivity 3.5.43 | 5/5 | 41261 | 8.63 | 2.00 | 1.00 | 33000 | n/a | 0.359 | comparable |
| semantic-noop-fanout | 1 | Reflex working tree | 5/5 | 20008448 | 2.86 | 1.00 | 0.00 | 300 | n/a | 1.000 | comparable |
| semantic-noop-fanout | 1 | Reflex e87bb66 | 5/5 | 19101970 | 1.07 | 1.00 | 0.00 | 300 | n/a | 0.944 | comparable |
| semantic-noop-fanout | 1 | alien-signals 3.2.1 | 5/5 | 20332173 | 0.35 | 1.00 | 0.00 | 300 | n/a | 1.015 | comparable |
| semantic-noop-fanout | 1 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 5418028 | 2.30 | 1.00 | 0.00 | 600 | n/a | 0.277 | comparable |
| semantic-noop-fanout | 1 | @vue/reactivity 3.5.43 | 5/5 | 12559464 | 9.81 | 1.00 | 0.00 | 400 | n/a | 0.670 | comparable |
| semantic-noop-fanout | 16 | Reflex working tree | 5/5 | 3321517 | 3.91 | 16.00 | 0.00 | 700 | n/a | 1.000 | comparable |
| semantic-noop-fanout | 16 | Reflex e87bb66 | 5/5 | 3215042 | 1.77 | 16.00 | 0.00 | 700 | n/a | 0.954 | comparable |
| semantic-noop-fanout | 16 | alien-signals 3.2.1 | 5/5 | 3090076 | 0.94 | 16.00 | 0.00 | 700 | n/a | 0.930 | comparable |
| semantic-noop-fanout | 16 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 681675 | 1.08 | 16.00 | 0.00 | 2600 | n/a | 0.198 | comparable |
| semantic-noop-fanout | 16 | @vue/reactivity 3.5.43 | 5/5 | 1594611 | 3.62 | 16.00 | 0.00 | 1000 | n/a | 0.482 | comparable |
| semantic-noop-fanout | 256 | Reflex working tree | 5/5 | 217748 | 4.87 | 256.00 | 0.00 | 7300 | n/a | 1.000 | comparable |
| semantic-noop-fanout | 256 | Reflex e87bb66 | 5/5 | 195985 | 11.67 | 256.00 | 0.00 | 7300 | n/a | 0.900 | comparable |
| semantic-noop-fanout | 256 | alien-signals 3.2.1 | 5/5 | 183775 | 9.51 | 256.00 | 0.00 | 7400 | n/a | 0.813 | comparable |
| semantic-noop-fanout | 256 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 49139 | 1.43 | 256.00 | 0.00 | 32400 | n/a | 0.228 | comparable |
| semantic-noop-fanout | 256 | @vue/reactivity 3.5.43 | 5/5 | 95558 | 1.40 | 256.00 | 0.00 | 14600 | n/a | 0.444 | comparable |
| semantic-noop-fanout | 1024 | Reflex working tree | 5/5 | 47893 | 6.61 | 1024.00 | 0.00 | 34100 | n/a | 1.000 | comparable |
| semantic-noop-fanout | 1024 | Reflex e87bb66 | 5/5 | 49030 | 0.44 | 1024.00 | 0.00 | 35500 | n/a | 1.028 | comparable |
| semantic-noop-fanout | 1024 | alien-signals 3.2.1 | 5/5 | 47304 | 5.31 | 1024.00 | 0.00 | 26700 | n/a | 0.988 | comparable |
| semantic-noop-fanout | 1024 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 12659 | 2.20 | 1024.00 | 0.00 | 121600 | n/a | 0.239 | comparable |
| semantic-noop-fanout | 1024 | @vue/reactivity 3.5.43 | 5/5 | 23274 | 3.16 | 1024.00 | 0.00 | 61500 | n/a | 0.490 | comparable |
| task-board | 32 | Reflex working tree | 5/5 | 2908663 | 1.35 | 1.67 | 0.67 | 900 | n/a | 1.000 | comparable |
| task-board | 32 | Reflex e87bb66 | 5/5 | 2862724 | 2.88 | 1.67 | 0.67 | 800 | n/a | 0.976 | comparable |
| task-board | 32 | alien-signals 3.2.1 | 5/5 | 2899725 | 1.25 | 1.67 | 0.67 | 800 | n/a | 0.997 | comparable |
| task-board | 32 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 704297 | 2.16 | 1.67 | 0.67 | 2600 | n/a | 0.240 | comparable |
| task-board | 32 | @vue/reactivity 3.5.43 | 5/5 | 977603 | 3.81 | 2.33 | 1.00 | 2300 | n/a | n/a | not comparable: Scenario requires publicBatch for equal public observable work |
| task-board | 256 | Reflex working tree | 5/5 | 539242 | 2.32 | 1.67 | 0.67 | 3300 | n/a | 1.000 | comparable |
| task-board | 256 | Reflex e87bb66 | 5/5 | 521776 | 0.77 | 1.67 | 0.67 | 3300 | n/a | 0.970 | comparable |
| task-board | 256 | alien-signals 3.2.1 | 5/5 | 511790 | 1.56 | 1.67 | 0.67 | 3300 | n/a | 0.999 | comparable |
| task-board | 256 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 152209 | 1.33 | 1.67 | 0.67 | 15200 | n/a | 0.282 | comparable |
| task-board | 256 | @vue/reactivity 3.5.43 | 5/5 | 141095 | 4.31 | 2.33 | 1.00 | 17100 | n/a | n/a | not comparable: Scenario requires publicBatch for equal public observable work |
| task-board | 1024 | Reflex working tree | 5/5 | 135760 | 3.22 | 1.67 | 0.67 | 12900 | n/a | 1.000 | comparable |
| task-board | 1024 | Reflex e87bb66 | 5/5 | 131399 | 1.58 | 1.67 | 0.67 | 12900 | n/a | 0.973 | comparable |
| task-board | 1024 | alien-signals 3.2.1 | 5/5 | 133792 | 6.14 | 1.67 | 0.67 | 14100 | n/a | 0.972 | comparable |
| task-board | 1024 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 41688 | 3.02 | 1.67 | 0.67 | 47000 | n/a | 0.307 | comparable |
| task-board | 1024 | @vue/reactivity 3.5.43 | 5/5 | 33382 | 6.97 | 2.33 | 1.00 | 69700 | n/a | n/a | not comparable: Scenario requires publicBatch for equal public observable work |
| wide-fanout | 1 | Reflex working tree | 5/5 | 16681679 | 2.88 | 1.00 | 1.00 | 400 | n/a | 1.000 | comparable |
| wide-fanout | 1 | Reflex e87bb66 | 5/5 | 15328265 | 2.16 | 1.00 | 1.00 | 400 | n/a | 0.939 | comparable |
| wide-fanout | 1 | alien-signals 3.2.1 | 5/5 | 18108217 | 3.12 | 1.00 | 1.00 | 400 | n/a | 1.076 | comparable |
| wide-fanout | 1 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 2349199 | 3.22 | 1.00 | 1.00 | 900 | n/a | 0.134 | comparable |
| wide-fanout | 1 | @vue/reactivity 3.5.43 | 5/5 | 11685859 | 3.55 | 1.00 | 1.00 | 400 | n/a | 0.700 | comparable |
| wide-fanout | 16 | Reflex working tree | 5/5 | 1249770 | 3.71 | 16.00 | 16.00 | 1200 | n/a | 1.000 | comparable |
| wide-fanout | 16 | Reflex e87bb66 | 5/5 | 1175730 | 4.91 | 16.00 | 16.00 | 1300 | n/a | 0.928 | comparable |
| wide-fanout | 16 | alien-signals 3.2.1 | 5/5 | 1299103 | 2.96 | 16.00 | 16.00 | 1200 | n/a | 1.046 | comparable |
| wide-fanout | 16 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 230707 | 1.68 | 16.00 | 16.00 | 5900 | n/a | 0.179 | comparable |
| wide-fanout | 16 | @vue/reactivity 3.5.43 | 5/5 | 888955 | 1.61 | 16.00 | 16.00 | 2500 | n/a | 0.730 | comparable |
| wide-fanout | 256 | Reflex working tree | 5/5 | 73609 | 6.09 | 256.00 | 256.00 | 19900 | n/a | 1.000 | comparable |
| wide-fanout | 256 | Reflex e87bb66 | 5/5 | 66490 | 6.50 | 256.00 | 256.00 | 20200 | n/a | 0.903 | comparable |
| wide-fanout | 256 | alien-signals 3.2.1 | 5/5 | 64670 | 2.72 | 256.00 | 256.00 | 31100 | n/a | 0.879 | comparable |
| wide-fanout | 256 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 15451 | 2.80 | 256.00 | 256.00 | 112700 | n/a | 0.201 | comparable |
| wide-fanout | 256 | @vue/reactivity 3.5.43 | 5/5 | 50308 | 1.59 | 256.00 | 256.00 | 43100 | n/a | 0.654 | comparable |
| wide-fanout | 1024 | Reflex working tree | 5/5 | 17665 | 0.89 | 1024.00 | 1024.00 | 100300 | n/a | 1.000 | comparable |
| wide-fanout | 1024 | Reflex e87bb66 | 5/5 | 16473 | 1.40 | 1024.00 | 1024.00 | 147700 | n/a | 0.981 | comparable |
| wide-fanout | 1024 | alien-signals 3.2.1 | 5/5 | 16053 | 5.81 | 1024.00 | 1024.00 | 100700 | n/a | 0.901 | comparable |
| wide-fanout | 1024 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 3621 | 2.50 | 1024.00 | 1024.00 | 418600 | n/a | 0.208 | comparable |
| wide-fanout | 1024 | @vue/reactivity 3.5.43 | 5/5 | 12172 | 1.89 | 1024.00 | 1024.00 | 136400 | n/a | 0.683 | comparable |
| window-dependency-churn | 4 | Reflex working tree | 5/5 | 7792926 | 3.02 | 1.00 | 1.00 | 500 | n/a | 1.000 | comparable |
| window-dependency-churn | 4 | Reflex e87bb66 | 5/5 | 7626030 | 3.64 | 1.00 | 1.00 | 500 | n/a | 0.974 | comparable |
| window-dependency-churn | 4 | alien-signals 3.2.1 | 5/5 | 5742546 | 7.41 | 1.00 | 1.00 | 500 | n/a | 0.737 | comparable |
| window-dependency-churn | 4 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 1775215 | 5.99 | 1.00 | 1.00 | 1000 | n/a | 0.227 | comparable |
| window-dependency-churn | 4 | @vue/reactivity 3.5.43 | 5/5 | 3293158 | 0.56 | 2.00 | 1.50 | 700 | n/a | n/a | not comparable: Scenario requires publicBatch for equal public observable work |
| window-dependency-churn | 16 | Reflex working tree | 5/5 | 4485375 | 5.01 | 1.00 | 1.00 | 600 | n/a | 1.000 | comparable |
| window-dependency-churn | 16 | Reflex e87bb66 | 5/5 | 4351984 | 9.35 | 1.00 | 1.00 | 600 | n/a | 0.988 | comparable |
| window-dependency-churn | 16 | alien-signals 3.2.1 | 5/5 | 3475943 | 1.37 | 1.00 | 1.00 | 600 | n/a | 0.778 | comparable |
| window-dependency-churn | 16 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 1431793 | 3.40 | 1.00 | 1.00 | 3300 | n/a | 0.328 | comparable |
| window-dependency-churn | 16 | @vue/reactivity 3.5.43 | 5/5 | 1972043 | 0.41 | 2.00 | 2.00 | 900 | n/a | n/a | not comparable: Scenario requires publicBatch for equal public observable work |
| window-dependency-churn | 64 | Reflex working tree | 5/5 | 1649690 | 3.98 | 1.00 | 1.00 | 1300 | n/a | 1.000 | comparable |
| window-dependency-churn | 64 | Reflex e87bb66 | 5/5 | 1680116 | 5.65 | 1.00 | 1.00 | 1300 | n/a | 1.025 | comparable |
| window-dependency-churn | 64 | alien-signals 3.2.1 | 5/5 | 1463951 | 10.76 | 1.00 | 1.00 | 1400 | n/a | 0.887 | comparable |
| window-dependency-churn | 64 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 826684 | 1.55 | 1.00 | 1.00 | 2100 | n/a | 0.487 | comparable |
| window-dependency-churn | 64 | @vue/reactivity 3.5.43 | 5/5 | 692403 | 2.74 | 2.00 | 2.00 | 2100 | n/a | n/a | not comparable: Scenario requires publicBatch for equal public observable work |
| window-dependency-churn | 256 | Reflex working tree | 5/5 | 431490 | 3.00 | 1.00 | 1.00 | 4400 | n/a | 1.000 | comparable |
| window-dependency-churn | 256 | Reflex e87bb66 | 5/5 | 446972 | 5.54 | 1.00 | 1.00 | 4300 | n/a | 1.036 | comparable |
| window-dependency-churn | 256 | alien-signals 3.2.1 | 5/5 | 435502 | 3.25 | 1.00 | 1.00 | 3100 | n/a | 0.980 | comparable |
| window-dependency-churn | 256 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 328170 | 4.28 | 1.00 | 1.00 | 4900 | n/a | 0.728 | comparable |
| window-dependency-churn | 256 | @vue/reactivity 3.5.43 | 5/5 | 199277 | 1.28 | 2.00 | 2.00 | 7400 | n/a | n/a | not comparable: Scenario requires publicBatch for equal public observable work |
| window-dependency-churn | 1024 | Reflex working tree | 5/5 | 123196 | 7.09 | 1.00 | 1.00 | 13400 | n/a | 1.000 | comparable |
| window-dependency-churn | 1024 | Reflex e87bb66 | 5/5 | 118190 | 5.27 | 1.00 | 1.00 | 11700 | n/a | 0.970 | comparable |
| window-dependency-churn | 1024 | alien-signals 3.2.1 | 5/5 | 112399 | 5.56 | 1.00 | 1.00 | 15100 | n/a | 0.982 | comparable |
| window-dependency-churn | 1024 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 92058 | 5.89 | 1.00 | 1.00 | 15300 | n/a | 0.747 | comparable |
| window-dependency-churn | 1024 | @vue/reactivity 3.5.43 | 5/5 | 47458 | 5.65 | 2.00 | 2.00 | 49300 | n/a | n/a | not comparable: Scenario requires publicBatch for equal public observable work |

Cross-runtime final-checksum comparison was skipped for 320 adaptive trace group(s) with different operation counts. Every worker still passed its scenario model validation; trace lengths are retained in JSON.

## Worker failures

- vue / changed-chain / size 4096 / trial 0: RangeError: Maximum call stack size exceeded
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:387:25)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
- solid2 / changed-chain / size 16384 / trial 0: RangeError: Maximum call stack size exceeded
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:95:18)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
- vue / changed-chain / size 16384 / trial 0: RangeError: Maximum call stack size exceeded
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:601:16)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
- vue / deep-unknown / size 4096 / trial 0: RangeError: Maximum call stack size exceeded
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:387:25)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
- vue / mostly-dirty / size 1024 / trial 0: Worker exited code=null signal=SIGTERM: SyntaxError: "undefined" is not valid JSON
- vue / changed-chain / size 4096 / trial 1: RangeError: Maximum call stack size exceeded
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:377:23)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
- solid2 / changed-chain / size 16384 / trial 1: RangeError: Maximum call stack size exceeded
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:95:18)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
- vue / changed-chain / size 16384 / trial 1: RangeError: Maximum call stack size exceeded
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:601:16)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
- vue / deep-unknown / size 4096 / trial 1: RangeError: Maximum call stack size exceeded
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:387:25)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
- vue / mostly-dirty / size 1024 / trial 1: Worker exited code=null signal=SIGTERM: SyntaxError: "undefined" is not valid JSON
- vue / changed-chain / size 4096 / trial 2: RangeError: Maximum call stack size exceeded
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:387:25)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
- vue / changed-chain / size 16384 / trial 2: RangeError: Maximum call stack size exceeded
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:601:16)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
- solid2 / changed-chain / size 16384 / trial 2: RangeError: Maximum call stack size exceeded
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:95:18)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
- vue / deep-unknown / size 4096 / trial 2: RangeError: Maximum call stack size exceeded
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:377:23)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
- vue / mostly-dirty / size 1024 / trial 2: Worker exited code=null signal=SIGTERM: SyntaxError: "undefined" is not valid JSON
- vue / changed-chain / size 4096 / trial 3: RangeError: Maximum call stack size exceeded
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:387:25)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
- solid2 / changed-chain / size 16384 / trial 3: RangeError: Maximum call stack size exceeded
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:95:18)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
- vue / changed-chain / size 16384 / trial 3: RangeError: Maximum call stack size exceeded
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:601:16)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
- vue / deep-unknown / size 4096 / trial 3: RangeError: Maximum call stack size exceeded
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:387:25)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
- vue / mostly-dirty / size 1024 / trial 3: Worker exited code=null signal=SIGTERM: SyntaxError: "undefined" is not valid JSON
- vue / changed-chain / size 4096 / trial 4: RangeError: Maximum call stack size exceeded
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:387:25)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
- solid2 / changed-chain / size 16384 / trial 4: RangeError: Maximum call stack size exceeded
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:95:18)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
    at markNode (file:///D:/PersonalProjects/ReflesIndustries/Reflex/node_modules/.pnpm/@solidjs+signals@2.0.0-rc.9/node_modules/@solidjs/signals/dist/prod/core/heap.js:100:9)
- vue / changed-chain / size 16384 / trial 4: RangeError: Maximum call stack size exceeded
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:601:16)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
    at addSub (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:608:9)
- vue / deep-unknown / size 4096 / trial 4: RangeError: Maximum call stack size exceeded
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:387:25)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
    at refreshComputed (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:396:90)
    at isDirty (D:\PersonalProjects\ReflesIndustries\Reflex\node_modules\.pnpm\@vue+reactivity@3.5.43\node_modules\@vue\reactivity\dist\reactivity.cjs.prod.js:378:68)
- vue / mostly-dirty / size 1024 / trial 4: Worker exited code=null signal=SIGTERM: SyntaxError: "undefined" is not valid JSON

Heap deltas and GC observations are diagnostics retained in JSON/CSV, not allocation measurements. Raw phase-separated work counters and failures are retained in JSON.
