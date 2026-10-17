# Experiment D: deactivate → W writes → reactivate

2026-10-15T14:38:44.340Z · node v25.2.0 · profile-test (__PROFILE__=true, __DEV__=false)

Regions A (always observed) and B (toggled), each 4×128 computeds, fan-in 3, 512 watchers per region. 16 shared producers feed both regions, 48 foreign producers feed only A. Means over 3 measured cycles; every reactivation is checked against a plain-JS reference (0 mismatches required).

`work` = push edges + pull edges + computes + edges created + edges removed over deactivate, sleep and reactivate. `Δ vs retain` < 0 means the variant pays off. `identity` = share of B top-layer result objects that survive a cycle.

## Writes to shared producers

| W | variant | deactivate work | sleep push edges | sleep work | reactivate computes | reactivate edges created | reactivate work | work | Δ vs retain | ns total | sleeping B edges | sleeping heap | identity |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | retain | 1529 | 0 | 0 | 0 | 1529 | 1529 | 3058 | 0 (0%) | 1.61 ms | 1510 | 1342 KiB | 100% |
| 0 | suspend-conservative | 3039 | 0 | 0 | 498 | 2999 | 3497 | 6536 | +3478 (113.7%) | 3.44 ms | 0 | 822 KiB | 0% |
| 0 | suspend-oracle | 3039 | 0 | 0 | 0 | 3039 | 3039 | 6078 | +3020 (98.8%) | 2.35 ms | 0 | 931 KiB | 100% |
| 0 | dispose-recreate | 3039 | 0 | 0 | 498 | 2999 | 3497 | 6536 | +3478 (113.7%) | 3.23 ms | 0 | 706 KiB | 0% |
| 1 | retain | 1529 | 1772 | 3459 | 302 | 1529 | 1924 | 6913 | 0 (0%) | 6.30 ms | 1510 | 1022 KiB | 1% |
| 1 | suspend-conservative | 3039 | 1214 | 2901 | 498 | 2999 | 3497 | 9437 | +2525 (36.5%) | 6.46 ms | 0 | 772 KiB | 0% |
| 1 | suspend-oracle | 3039 | 1214 | 2901 | 302 | 3039 | 3341 | 9281 | +2368 (34.3%) | 6.75 ms | 0 | 906 KiB | 1% |
| 1 | dispose-recreate | 3039 | 1214 | 2901 | 498 | 2999 | 3497 | 9437 | +2525 (36.5%) | 6.05 ms | 0 | 727 KiB | 0% |
| 10 | retain | 1529 | 12798 | 29081 | 472 | 1529 | 2052 | 32662 | 0 (0%) | 27.55 ms | 1510 | 955 KiB | 0% |
| 10 | suspend-conservative | 3039 | 11515 | 27799 | 498 | 2999 | 3497 | 34335 | +1673 (5.1%) | 26.82 ms | 0 | 836 KiB | 0% |
| 10 | suspend-oracle | 3039 | 11515 | 27799 | 472 | 3039 | 3511 | 34348 | +1686 (5.2%) | 27.95 ms | 0 | 966 KiB | 0% |
| 10 | dispose-recreate | 3039 | 11515 | 27799 | 498 | 2999 | 3497 | 34335 | +1673 (5.1%) | 29.32 ms | 0 | 771 KiB | 0% |
| 100 | retain | 1529 | 120841 | 283957 | 498 | 1529 | 2067 | 287553 | 0 (0%) | 239.45 ms | 1510 | 1018 KiB | 0% |
| 100 | suspend-conservative | 3039 | 117422 | 280538 | 498 | 2999 | 3497 | 287074 | -479 (-0.2%) | 228.59 ms | 0 | 912 KiB | 0% |
| 100 | suspend-oracle | 3039 | 117422 | 280538 | 498 | 3039 | 3537 | 287114 | -439 (-0.2%) | 231.11 ms | 0 | 1002 KiB | 0% |
| 100 | dispose-recreate | 3039 | 117422 | 280538 | 498 | 2999 | 3497 | 287074 | -479 (-0.2%) | 243.66 ms | 0 | 835 KiB | 0% |
| 1000 | retain | 1529 | 1195998 | 2829112 | 498 | 1529 | 2067 | 2832708 | 0 (0%) | 2288.90 ms | 1510 | 1082 KiB | 0% |
| 1000 | suspend-conservative | 3039 | 1172057 | 2805170 | 498 | 2999 | 3497 | 2811706 | -21001 (-0.7%) | 2279.91 ms | 0 | 922 KiB | 0% |
| 1000 | suspend-oracle | 3039 | 1172057 | 2805170 | 498 | 3039 | 3537 | 2811746 | -20961 (-0.7%) | 2263.61 ms | 0 | 1059 KiB | 0% |
| 1000 | dispose-recreate | 3039 | 1172057 | 2805170 | 498 | 2999 | 3497 | 2811706 | -21001 (-0.7%) | 2256.78 ms | 0 | 846 KiB | 0% |

## Writes to foreign producers

| W | variant | deactivate work | sleep push edges | sleep work | reactivate computes | reactivate edges created | reactivate work | work | Δ vs retain | ns total | sleeping B edges | sleeping heap | identity |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | retain | 1529 | 0 | 0 | 0 | 1529 | 1529 | 3058 | 0 (0%) | 1.91 ms | 1510 | 833 KiB | 100% |
| 0 | suspend-conservative | 3039 | 0 | 0 | 498 | 2999 | 3497 | 6536 | +3478 (113.7%) | 3.44 ms | 0 | 744 KiB | 0% |
| 0 | suspend-oracle | 3039 | 0 | 0 | 0 | 3039 | 3039 | 6078 | +3020 (98.8%) | 2.16 ms | 0 | 863 KiB | 100% |
| 0 | dispose-recreate | 3039 | 0 | 0 | 498 | 2999 | 3497 | 6536 | +3478 (113.7%) | 3.54 ms | 0 | 638 KiB | 0% |
| 1 | retain | 1529 | 1204 | 2885 | 0 | 1529 | 1529 | 5943 | 0 (0%) | 5.12 ms | 1510 | 904 KiB | 100% |
| 1 | suspend-conservative | 3039 | 1204 | 2885 | 498 | 2999 | 3497 | 9421 | +3478 (58.5%) | 6.20 ms | 0 | 747 KiB | 0% |
| 1 | suspend-oracle | 3039 | 1204 | 2885 | 0 | 3039 | 3039 | 8963 | +3020 (50.8%) | 5.41 ms | 0 | 889 KiB | 100% |
| 1 | dispose-recreate | 3039 | 1204 | 2885 | 498 | 2999 | 3497 | 9421 | +3478 (58.5%) | 6.53 ms | 0 | 681 KiB | 0% |
| 10 | retain | 1529 | 12055 | 28720 | 0 | 1529 | 1529 | 31778 | 0 (0%) | 33.26 ms | 1510 | 980 KiB | 100% |
| 10 | suspend-conservative | 3039 | 12055 | 28720 | 498 | 2999 | 3497 | 35256 | +3478 (10.9%) | 28.95 ms | 0 | 823 KiB | 0% |
| 10 | suspend-oracle | 3039 | 12055 | 28720 | 0 | 3039 | 3039 | 34798 | +3020 (9.5%) | 26.50 ms | 0 | 953 KiB | 100% |
| 10 | dispose-recreate | 3039 | 12055 | 28720 | 498 | 2999 | 3497 | 35256 | +3478 (10.9%) | 28.61 ms | 0 | 719 KiB | 0% |
| 100 | retain | 1529 | 114791 | 275036 | 0 | 1529 | 1529 | 278094 | 0 (0%) | 223.60 ms | 1510 | 994 KiB | 100% |
| 100 | suspend-conservative | 3039 | 114791 | 275036 | 498 | 2999 | 3497 | 281572 | +3478 (1.3%) | 219.31 ms | 0 | 873 KiB | 0% |
| 100 | suspend-oracle | 3039 | 114791 | 275036 | 0 | 3039 | 3039 | 281114 | +3020 (1.1%) | 221.96 ms | 0 | 987 KiB | 100% |
| 100 | dispose-recreate | 3039 | 114791 | 275036 | 498 | 2999 | 3497 | 281572 | +3478 (1.3%) | 225.59 ms | 0 | 791 KiB | 0% |
| 1000 | retain | 1529 | 1148597 | 2739195 | 0 | 1529 | 1529 | 2742253 | 0 (0%) | 2206.66 ms | 1510 | 1061 KiB | 100% |
| 1000 | suspend-conservative | 3039 | 1148597 | 2739195 | 498 | 2999 | 3497 | 2745731 | +3478 (0.1%) | 2259.26 ms | 0 | 928 KiB | 0% |
| 1000 | suspend-oracle | 3039 | 1148597 | 2739195 | 0 | 3039 | 3039 | 2745273 | +3020 (0.1%) | 2240.70 ms | 0 | 1054 KiB | 100% |
| 1000 | dispose-recreate | 3039 | 1148597 | 2739195 | 498 | 2999 | 3497 | 2745731 | +3478 (0.1%) | 2206.53 ms | 0 | 847 KiB | 0% |
