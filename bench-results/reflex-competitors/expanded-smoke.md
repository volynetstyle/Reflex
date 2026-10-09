# Reflex competitor benchmark

Generated: 2026-09-22T09:36:04.232Z on v25.2.0 / 14.1.146.11-node.13

Medians are across fresh-process trials. `vs Reflex` is competitor throughput divided by Reflex throughput; values below 1 are slower than Reflex.

| Scenario | Size | Framework | ops/s | p99 ns | p999 ns | retained heap Δ B/op | vs Reflex |
|---|---:|---|---:|---:|---:|---:|---:|
| changed-chain | 16 | Reflex 1.0.0 | 69735 | n/a | n/a | -3610.40 | 1.000 |
| changed-chain | 16 | alien-signals 3.2.1 | 85653 | n/a | n/a | -459.60 | 1.228 |
| changed-chain | 16 | @solidjs/signals 2.0.0-rc.9 | 28062 | n/a | n/a | 9400.80 | 0.402 |
| changed-chain | 16 | @vue/reactivity 3.5.43 | 49456 | n/a | n/a | 370.40 | 0.709 |
| changed-leaf | 1 | Reflex 1.0.0 | 172265 | n/a | n/a | 105.60 | 1.000 |
| changed-leaf | 1 | alien-signals 3.2.1 | 265252 | n/a | n/a | 11926.80 | 1.540 |
| changed-leaf | 1 | @solidjs/signals 2.0.0-rc.9 | 90416 | n/a | n/a | 1368.80 | 0.525 |
| changed-leaf | 1 | @vue/reactivity 3.5.43 | 238095 | n/a | n/a | -11114.80 | 1.382 |
| clean-edge | 16 | Reflex 1.0.0 | 1869159 | n/a | n/a | 105.60 | 1.000 |
| clean-edge | 16 | alien-signals 3.2.1 | 2083333 | n/a | n/a | 106.40 | 1.115 |
| clean-edge | 16 | @solidjs/signals 2.0.0-rc.9 | 1418440 | n/a | n/a | 105.60 | 0.759 |
| clean-edge | 16 | @vue/reactivity 3.5.43 | 1639344 | n/a | n/a | 105.60 | 0.877 |
| deep-unknown | 16 | Reflex 1.0.0 | 111235 | n/a | n/a | 105.60 | 1.000 |
| deep-unknown | 16 | alien-signals 3.2.1 | 130634 | n/a | n/a | 873.20 | 1.174 |
| deep-unknown | 16 | @solidjs/signals 2.0.0-rc.9 | 137080 | n/a | n/a | 494.40 | 1.232 |
| deep-unknown | 16 | @vue/reactivity 3.5.43 | 97182 | n/a | n/a | 26832.40 | 0.874 |
| diamond-fan-in | 16 | Reflex 1.0.0 | 58875 | n/a | n/a | 252.40 | 1.000 |
| diamond-fan-in | 16 | alien-signals 3.2.1 | 55494 | n/a | n/a | 17901.20 | 0.943 |
| diamond-fan-in | 16 | @solidjs/signals 2.0.0-rc.9 | 14094 | n/a | n/a | 12889.60 | 0.239 |
| diamond-fan-in | 16 | @vue/reactivity 3.5.43 | 41237 | n/a | n/a | 916.00 | 0.700 |
| dynamic-branch | 16 | Reflex 1.0.0 | 56513 | n/a | n/a | 3565.60 | 1.000 |
| dynamic-branch | 16 | alien-signals 3.2.1 | 72727 | n/a | n/a | 699.20 | 1.287 |
| dynamic-branch | 16 | @solidjs/signals 2.0.0-rc.9 | 80548 | n/a | n/a | 120.00 | 1.425 |
| dynamic-branch | 16 | @vue/reactivity 3.5.43 | 74878 | n/a | n/a | 509.20 | 1.325 |
| effect-fanout | 16 | Reflex 1.0.0 | 54171 | n/a | n/a | 144.40 | 1.000 |
| effect-fanout | 16 | alien-signals 3.2.1 | 107411 | n/a | n/a | 19111.60 | 1.983 |
| effect-fanout | 16 | @solidjs/signals 2.0.0-rc.9 | 29560 | n/a | n/a | 649.60 | 0.546 |
| effect-fanout | 16 | @vue/reactivity 3.5.43 | 73287 | n/a | n/a | 13595.60 | 1.353 |
| equal-leaf | 1 | Reflex 1.0.0 | 464037 | n/a | n/a | 11051.20 | 1.000 |
| equal-leaf | 1 | alien-signals 3.2.1 | 847458 | n/a | n/a | 12960.40 | 1.826 |
| equal-leaf | 1 | @solidjs/signals 2.0.0-rc.9 | 298954 | n/a | n/a | 120.00 | 0.644 |
| equal-leaf | 1 | @vue/reactivity 3.5.43 | 696864 | n/a | n/a | 1895.20 | 1.502 |
| failure-retry | 16 | Reflex 1.0.0 | 55850 | n/a | n/a | 24753.20 | 1.000 |
| failure-retry | 16 | alien-signals 3.2.1 | 60827 | n/a | n/a | 19317.60 | 1.089 |
| failure-retry | 16 | @solidjs/signals 2.0.0-rc.9 | 16024 | n/a | n/a | 4761.20 | 0.287 |
| failure-retry | 16 | @vue/reactivity 3.5.43 | 40201 | n/a | n/a | 18690.80 | 0.720 |
| layered-dag | 8 | Reflex 1.0.0 | 26185 | n/a | n/a | 22159.60 | 1.000 |
| layered-dag | 8 | alien-signals 3.2.1 | 29070 | n/a | n/a | -14257.60 | 1.110 |
| layered-dag | 8 | @solidjs/signals 2.0.0-rc.9 | 6128 | n/a | n/a | 4824.40 | 0.234 |
| layered-dag | 8 | @vue/reactivity 3.5.43 | 17835 | n/a | n/a | -13790.80 | 0.681 |
| lifecycle-churn | 16 | Reflex 1.0.0 | 28629 | n/a | n/a | -13554.80 | 1.000 |
| lifecycle-churn | 16 | alien-signals 3.2.1 | 47835 | n/a | n/a | 44638.00 | 1.671 |
| lifecycle-churn | 16 | @solidjs/signals 2.0.0-rc.9 | 12595 | n/a | n/a | 3422.00 | 0.440 |
| lifecycle-churn | 16 | @vue/reactivity 3.5.43 | 31363 | n/a | n/a | 10840.40 | 1.095 |
| mostly-dirty | 256 | Reflex 1.0.0 | 24263 | n/a | n/a | 7832.80 | 1.000 |
| mostly-dirty | 256 | alien-signals 3.2.1 | 22591 | n/a | n/a | 18434.80 | 0.931 |
| mostly-dirty | 256 | @solidjs/signals 2.0.0-rc.9 | 11346 | n/a | n/a | 137.60 | 0.468 |
| mostly-dirty | 256 | @vue/reactivity 3.5.43 | 901 | n/a | n/a | 1171.60 | 0.037 |
| reorder-dependencies | 64 | Reflex 1.0.0 | 38941 | n/a | n/a | 105.60 | 1.000 |
| reorder-dependencies | 64 | alien-signals 3.2.1 | 44843 | n/a | n/a | 499.60 | 1.152 |
| reorder-dependencies | 64 | @solidjs/signals 2.0.0-rc.9 | 27405 | n/a | n/a | 281.20 | 0.704 |
| reorder-dependencies | 64 | @vue/reactivity 3.5.43 | 40193 | n/a | n/a | 313.20 | 1.032 |
| selective-update | 256 | Reflex 1.0.0 | 32227 | n/a | n/a | 495.20 | 1.000 |
| selective-update | 256 | alien-signals 3.2.1 | 27356 | n/a | n/a | 1093.60 | 0.849 |
| selective-update | 256 | @solidjs/signals 2.0.0-rc.9 | 16046 | n/a | n/a | -2602.40 | 0.498 |
| selective-update | 256 | @vue/reactivity 3.5.43 | 40185 | n/a | n/a | 90.40 | 1.247 |
| semantic-noop-fanout | 16 | Reflex 1.0.0 | 79114 | n/a | n/a | -417.20 | 1.000 |
| semantic-noop-fanout | 16 | alien-signals 3.2.1 | 70447 | n/a | n/a | 45379.20 | 0.890 |
| semantic-noop-fanout | 16 | @solidjs/signals 2.0.0-rc.9 | 39331 | n/a | n/a | 158.00 | 0.497 |
| semantic-noop-fanout | 16 | @vue/reactivity 3.5.43 | 56007 | n/a | n/a | 6442.80 | 0.708 |
| task-board | 256 | Reflex 1.0.0 | 33129 | n/a | n/a | 196.40 | 1.000 |
| task-board | 256 | alien-signals 3.2.1 | 29882 | n/a | n/a | 344.00 | 0.902 |
| task-board | 256 | @solidjs/signals 2.0.0-rc.9 | 16892 | n/a | n/a | 3077.20 | 0.510 |
| task-board | 256 | @vue/reactivity 3.5.43 | 28927 | n/a | n/a | 645.60 | 0.873 |
| wide-fanout | 16 | Reflex 1.0.0 | 27174 | n/a | n/a | 17771.20 | 1.000 |
| wide-fanout | 16 | alien-signals 3.2.1 | 81334 | n/a | n/a | 45356.80 | 2.993 |
| wide-fanout | 16 | @solidjs/signals 2.0.0-rc.9 | 13366 | n/a | n/a | 16267.60 | 0.492 |
| wide-fanout | 16 | @vue/reactivity 3.5.43 | 49505 | n/a | n/a | 21273.60 | 1.822 |
| window-dependency-churn | 16 | Reflex 1.0.0 | 61557 | n/a | n/a | 11284.00 | 1.000 |
| window-dependency-churn | 16 | alien-signals 3.2.1 | 117028 | n/a | n/a | 8475.20 | 1.901 |
| window-dependency-churn | 16 | @solidjs/signals 2.0.0-rc.9 | 47393 | n/a | n/a | 705.60 | 0.770 |
| window-dependency-churn | 16 | @vue/reactivity 3.5.43 | 102145 | n/a | n/a | 498.80 | 1.659 |

Raw worker results, actual-work counters, GC observations, and failures are retained in the JSON report.
