# Reflex competitor benchmark

Generated: 2026-09-22T09:45:33.376Z on v25.2.0 / 14.1.146.11-node.13

Medians are across fresh-process trials. `vs Reflex` is competitor throughput divided by Reflex throughput; values below 1 are slower than Reflex.

| Scenario | Size | Framework | ops/s | p99 ns | p999 ns | retained heap Δ B/op | vs Reflex |
|---|---:|---|---:|---:|---:|---:|---:|
| changed-chain | 16 | Reflex working tree | 63816 | n/a | n/a | -18793.60 | 1.000 |
| changed-chain | 16 | Reflex e87bb66 | 78156 | n/a | n/a | 346.00 | 1.225 |
| changed-chain | 16 | alien-signals 3.2.1 | 80580 | n/a | n/a | 284.40 | 1.263 |
| changed-chain | 16 | @solidjs/signals 2.0.0-rc.9 | 27518 | n/a | n/a | 976.00 | 0.431 |
| changed-chain | 16 | @vue/reactivity 3.5.43 | 62150 | n/a | n/a | 23283.20 | 0.974 |
| changed-leaf | 1 | Reflex working tree | 162338 | n/a | n/a | 1064.80 | 1.000 |
| changed-leaf | 1 | Reflex e87bb66 | 178891 | n/a | n/a | 1093.20 | 1.102 |
| changed-leaf | 1 | alien-signals 3.2.1 | 265252 | n/a | n/a | -10818.80 | 1.634 |
| changed-leaf | 1 | @solidjs/signals 2.0.0-rc.9 | 85985 | n/a | n/a | 884.40 | 0.530 |
| changed-leaf | 1 | @vue/reactivity 3.5.43 | 240385 | n/a | n/a | -11322.00 | 1.481 |
| clean-edge | 16 | Reflex working tree | 1886792 | n/a | n/a | 105.60 | 1.000 |
| clean-edge | 16 | Reflex e87bb66 | 2127660 | n/a | n/a | 105.60 | 1.128 |
| clean-edge | 16 | alien-signals 3.2.1 | 2150538 | n/a | n/a | 106.40 | 1.140 |
| clean-edge | 16 | @solidjs/signals 2.0.0-rc.9 | 1351351 | n/a | n/a | -9591.20 | 0.716 |
| clean-edge | 16 | @vue/reactivity 3.5.43 | 1754386 | n/a | n/a | 106.40 | 0.930 |
| deep-unknown | 16 | Reflex working tree | 66138 | n/a | n/a | 458.80 | 1.000 |
| deep-unknown | 16 | Reflex e87bb66 | 127714 | n/a | n/a | 390.40 | 1.931 |
| deep-unknown | 16 | alien-signals 3.2.1 | 140647 | n/a | n/a | 18670.00 | 2.127 |
| deep-unknown | 16 | @solidjs/signals 2.0.0-rc.9 | 140944 | n/a | n/a | 706.00 | 2.131 |
| deep-unknown | 16 | @vue/reactivity 3.5.43 | 101937 | n/a | n/a | 1474.80 | 1.541 |
| diamond-fan-in | 16 | Reflex working tree | 57389 | n/a | n/a | 329.60 | 1.000 |
| diamond-fan-in | 16 | Reflex e87bb66 | 40128 | n/a | n/a | 9953.20 | 0.699 |
| diamond-fan-in | 16 | alien-signals 3.2.1 | 84782 | n/a | n/a | 24070.40 | 1.477 |
| diamond-fan-in | 16 | @solidjs/signals 2.0.0-rc.9 | 23565 | n/a | n/a | -23008.00 | 0.411 |
| diamond-fan-in | 16 | @vue/reactivity 3.5.43 | 51908 | n/a | n/a | 23294.80 | 0.904 |
| dynamic-branch | 16 | Reflex working tree | 111421 | n/a | n/a | -9695.60 | 1.000 |
| dynamic-branch | 16 | Reflex e87bb66 | 104877 | n/a | n/a | 804.40 | 0.941 |
| dynamic-branch | 16 | alien-signals 3.2.1 | 172861 | n/a | n/a | 448.00 | 1.551 |
| dynamic-branch | 16 | @solidjs/signals 2.0.0-rc.9 | 50607 | n/a | n/a | -6097.20 | 0.454 |
| dynamic-branch | 16 | @vue/reactivity 3.5.43 | 141044 | n/a | n/a | 13755.20 | 1.266 |
| effect-fanout | 16 | Reflex working tree | 46221 | n/a | n/a | 664.40 | 1.000 |
| effect-fanout | 16 | Reflex e87bb66 | 51962 | n/a | n/a | 22944.00 | 1.124 |
| effect-fanout | 16 | alien-signals 3.2.1 | 105541 | n/a | n/a | 120.80 | 2.283 |
| effect-fanout | 16 | @solidjs/signals 2.0.0-rc.9 | 29682 | n/a | n/a | 3534.40 | 0.642 |
| effect-fanout | 16 | @vue/reactivity 3.5.43 | 77851 | n/a | n/a | 23874.40 | 1.684 |
| equal-leaf | 1 | Reflex working tree | 487805 | n/a | n/a | 810.80 | 1.000 |
| equal-leaf | 1 | Reflex e87bb66 | 454545 | n/a | n/a | 572.00 | 0.932 |
| equal-leaf | 1 | alien-signals 3.2.1 | 892857 | n/a | n/a | 223.20 | 1.830 |
| equal-leaf | 1 | @solidjs/signals 2.0.0-rc.9 | 671141 | n/a | n/a | 120.80 | 1.376 |
| equal-leaf | 1 | @vue/reactivity 3.5.43 | 657895 | n/a | n/a | 644.80 | 1.349 |
| failure-retry | 16 | Reflex working tree | 53908 | n/a | n/a | 859.60 | 1.000 |
| failure-retry | 16 | Reflex e87bb66 | 53476 | n/a | n/a | 100.00 | 0.992 |
| failure-retry | 16 | alien-signals 3.2.1 | 59471 | n/a | n/a | 18605.20 | 1.103 |
| failure-retry | 16 | @solidjs/signals 2.0.0-rc.9 | 16353 | n/a | n/a | 1761.20 | 0.303 |
| failure-retry | 16 | @vue/reactivity 3.5.43 | 37622 | n/a | n/a | 23748.00 | 0.698 |
| layered-dag | 8 | Reflex working tree | 33311 | n/a | n/a | 1241.20 | 1.000 |
| layered-dag | 8 | Reflex e87bb66 | 37750 | n/a | n/a | 23616.00 | 1.133 |
| layered-dag | 8 | alien-signals 3.2.1 | 40984 | n/a | n/a | 610.40 | 1.230 |
| layered-dag | 8 | @solidjs/signals 2.0.0-rc.9 | 8448 | n/a | n/a | 12505.60 | 0.254 |
| layered-dag | 8 | @vue/reactivity 3.5.43 | 23521 | n/a | n/a | -21944.40 | 0.706 |
| lifecycle-churn | 16 | Reflex working tree | 29108 | n/a | n/a | -9565.60 | 1.000 |
| lifecycle-churn | 16 | Reflex e87bb66 | 29886 | n/a | n/a | 10443.60 | 1.027 |
| lifecycle-churn | 16 | alien-signals 3.2.1 | 45045 | n/a | n/a | 521.60 | 1.548 |
| lifecycle-churn | 16 | @solidjs/signals 2.0.0-rc.9 | 13404 | n/a | n/a | -9349.20 | 0.460 |
| lifecycle-churn | 16 | @vue/reactivity 3.5.43 | 33546 | n/a | n/a | 463.60 | 1.152 |
| mostly-dirty | 256 | Reflex working tree | 20145 | n/a | n/a | 2740.40 | 1.000 |
| mostly-dirty | 256 | Reflex e87bb66 | 25621 | n/a | n/a | 2912.00 | 1.272 |
| mostly-dirty | 256 | alien-signals 3.2.1 | 23345 | n/a | n/a | 937.60 | 1.159 |
| mostly-dirty | 256 | @solidjs/signals 2.0.0-rc.9 | 7549 | n/a | n/a | 129.60 | 0.375 |
| mostly-dirty | 256 | @vue/reactivity 3.5.43 | 1042 | n/a | n/a | 1302.00 | 0.052 |
| reorder-dependencies | 64 | Reflex working tree | 44964 | n/a | n/a | 798.40 | 1.000 |
| reorder-dependencies | 64 | Reflex e87bb66 | 45280 | n/a | n/a | 472.00 | 1.007 |
| reorder-dependencies | 64 | alien-signals 3.2.1 | 44613 | n/a | n/a | 206.40 | 0.992 |
| reorder-dependencies | 64 | @solidjs/signals 2.0.0-rc.9 | 27537 | n/a | n/a | 25548.80 | 0.612 |
| reorder-dependencies | 64 | @vue/reactivity 3.5.43 | 43057 | n/a | n/a | 736.00 | 0.958 |
| selective-update | 256 | Reflex working tree | 48721 | n/a | n/a | -15397.60 | 1.000 |
| selective-update | 256 | Reflex e87bb66 | 45300 | n/a | n/a | -21456.80 | 0.930 |
| selective-update | 256 | alien-signals 3.2.1 | 43516 | n/a | n/a | 21957.20 | 0.893 |
| selective-update | 256 | @solidjs/signals 2.0.0-rc.9 | 12807 | n/a | n/a | 3649.60 | 0.263 |
| selective-update | 256 | @vue/reactivity 3.5.43 | 22941 | n/a | n/a | 124.40 | 0.471 |
| semantic-noop-fanout | 16 | Reflex working tree | 76982 | n/a | n/a | 249.20 | 1.000 |
| semantic-noop-fanout | 16 | Reflex e87bb66 | 68634 | n/a | n/a | 183.60 | 0.892 |
| semantic-noop-fanout | 16 | alien-signals 3.2.1 | 98522 | n/a | n/a | 268.40 | 1.280 |
| semantic-noop-fanout | 16 | @solidjs/signals 2.0.0-rc.9 | 39604 | n/a | n/a | 240.00 | 0.514 |
| semantic-noop-fanout | 16 | @vue/reactivity 3.5.43 | 63452 | n/a | n/a | 954.40 | 0.824 |
| task-board | 256 | Reflex working tree | 49776 | n/a | n/a | 1744.00 | 1.000 |
| task-board | 256 | Reflex e87bb66 | 51243 | n/a | n/a | 1514.80 | 1.029 |
| task-board | 256 | alien-signals 3.2.1 | 50025 | n/a | n/a | 23969.60 | 1.005 |
| task-board | 256 | @solidjs/signals 2.0.0-rc.9 | 17671 | n/a | n/a | 3734.40 | 0.355 |
| task-board | 256 | @vue/reactivity 3.5.43 | 18399 | n/a | n/a | 3322.40 | 0.370 |
| wide-fanout | 16 | Reflex working tree | 58634 | n/a | n/a | -25315.20 | 1.000 |
| wide-fanout | 16 | Reflex e87bb66 | 21765 | n/a | n/a | 22915.20 | 0.371 |
| wide-fanout | 16 | alien-signals 3.2.1 | 88849 | n/a | n/a | 23918.00 | 1.515 |
| wide-fanout | 16 | @solidjs/signals 2.0.0-rc.9 | 12510 | n/a | n/a | 6815.20 | 0.213 |
| wide-fanout | 16 | @vue/reactivity 3.5.43 | 41102 | n/a | n/a | 662.00 | 0.701 |
| window-dependency-churn | 16 | Reflex working tree | 108284 | n/a | n/a | 17935.20 | 1.000 |
| window-dependency-churn | 16 | Reflex e87bb66 | 108167 | n/a | n/a | 16514.40 | 0.999 |
| window-dependency-churn | 16 | alien-signals 3.2.1 | 147493 | n/a | n/a | 502.40 | 1.362 |
| window-dependency-churn | 16 | @solidjs/signals 2.0.0-rc.9 | 45382 | n/a | n/a | 21708.00 | 0.419 |
| window-dependency-churn | 16 | @vue/reactivity 3.5.43 | 111421 | n/a | n/a | 22301.20 | 1.029 |

Raw worker results, actual-work counters, GC observations, and failures are retained in the JSON report.
