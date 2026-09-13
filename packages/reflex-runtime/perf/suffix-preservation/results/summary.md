# Measured suffix-preservation results

Baseline: 11f0d914dcd3c4234efb26e1aa94ecc88967303a. v25.2.0; 12th Gen Intel(R) Core(TM) i5-1235U; win32.

All counts are per completed write/read transition, excluding setup. Timing deltas compare mean ns/op: negative is faster. The complete raw samples and variance/RME are in results.json and results-first.json. See ../README.md for metric definitions and limitations.

## Mean wall time, two full runs

| Workload | D | Before ns/op (run 2) | After ns/op (run 2) | Delta run 1 | Delta run 2 | Before RME | After RME | Before/after batch p99 ns/op |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| stable | 0 | 25.089 | 25.225 | -0.8% | +0.5% | 2.7% | 2.3% | 27.704 / 26.944 |
| stable | 1 | 32.807 | 33.016 | -2.3% | +0.6% | 3.8% | 3.0% | 37.751 / 37.744 |
| stable | 16 | 93.709 | 97.367 | -0.3% | +3.9% | 1.8% | 2.9% | 98.395 / 107.722 |
| stable | 31 | 151.383 | 152.280 | +1.3% | +0.6% | 2.5% | 2.7% | 162.339 / 162.074 |
| stable | 32 | 149.826 | 151.195 | -0.4% | +0.9% | 2.6% | 2.0% | 165.132 / 160.456 |
| stable | 33 | 156.933 | 155.206 | -3.0% | -1.1% | 1.9% | 2.4% | 164.530 / 166.727 |
| stable | 64 | 265.103 | 265.928 | -0.2% | +0.3% | 2.1% | 1.7% | 278.946 / 280.197 |
| stable | 256 | 922.997 | 915.666 | +0.3% | -0.8% | 2.4% | 2.2% | 1007.631 / 968.287 |
| stable | 1024 | 5056.402 | 5125.827 | -0.7% | +1.4% | 2.9% | 2.7% | 5487.846 / 5812.577 |
| stable | 4096 | 23311.953 | 23769.596 | +1.0% | +2.0% | 3.3% | 3.5% | 25330.352 / 25701.350 |
| alternating | 0 | 66.507 | 64.838 | -5.2% | -2.5% | 2.0% | 2.2% | 70.107 / 70.069 |
| alternating | 1 | 84.617 | 79.846 | +1.2% | -5.6% | 2.5% | 1.8% | 92.704 / 84.680 |
| alternating | 16 | 321.974 | 304.609 | -5.6% | -5.4% | 2.8% | 2.5% | 351.941 / 330.854 |
| alternating | 31 | 830.265 | 503.438 | -39.8% | -39.4% | 2.3% | 1.9% | 907.846 / 537.777 |
| alternating | 32 | 891.818 | 527.184 | -38.0% | -40.9% | 2.2% | 1.9% | 966.862 / 560.976 |
| alternating | 33 | 893.695 | 539.210 | -34.2% | -39.7% | 1.5% | 2.0% | 939.309 / 578.416 |
| alternating | 64 | 1548.785 | 936.553 | -39.7% | -39.5% | 2.7% | 1.2% | 1688.594 / 985.290 |
| alternating | 256 | 6287.052 | 3768.656 | -41.1% | -40.1% | 7.5% | 9.5% | 8850.937 / 5748.204 |
| alternating | 1024 | 25384.043 | 14995.332 | -41.9% | -40.9% | 3.2% | 5.2% | 28709.264 / 18269.082 |
| alternating | 4096 | 106665.391 | 58442.682 | -41.2% | -45.2% | 3.3% | 2.7% | 117148.508 / 62604.633 |
| replacement | 0 | 31.323 | 34.021 | +1.0% | +8.6% | 3.5% | 13.5% | 35.534 / 58.825 |
| replacement | 1 | 76.317 | 72.971 | -4.2% | -4.4% | 5.8% | 9.2% | 95.072 / 102.232 |
| replacement | 16 | 844.792 | 570.440 | -29.4% | -32.5% | 8.3% | 8.0% | 1189.102 / 751.661 |
| replacement | 31 | 1996.548 | 827.972 | -56.4% | -58.5% | 2.3% | 1.8% | 2132.748 / 881.104 |
| replacement | 32 | 862.916 | 865.094 | +7.7% | +0.3% | 2.8% | 2.4% | 925.266 / 942.163 |
| replacement | 33 | 879.614 | 889.803 | +5.7% | +1.2% | 1.8% | 2.4% | 924.842 / 960.254 |
| replacement | 64 | 1559.144 | 1663.881 | +5.2% | +6.7% | 2.4% | 2.4% | 1706.260 / 1800.088 |
| replacement | 256 | 6051.177 | 7129.409 | +12.3% | +17.8% | 2.0% | 2.7% | 6360.067 / 7584.848 |
| replacement | 1024 | 25072.487 | 28298.802 | +14.2% | +12.9% | 2.6% | 2.3% | 26978.848 / 30470.957 |
| replacement | 4096 | 105654.531 | 135990.911 | +30.4% | +28.7% | 3.6% | 4.0% | 115530.016 / 150193.039 |
| reorder | 0 | 27.448 | 27.452 | -2.4% | +0.0% | 3.0% | 2.8% | 30.874 / 30.275 |
| reorder | 1 | 33.811 | 34.700 | -0.7% | +2.6% | 2.0% | 2.0% | 35.599 / 36.686 |
| reorder | 16 | 275.117 | 279.070 | +2.0% | +1.4% | 2.2% | 1.9% | 294.478 / 295.338 |
| reorder | 31 | 711.421 | 742.490 | +1.1% | +4.4% | 2.3% | 2.4% | 767.431 / 790.786 |
| reorder | 32 | 755.681 | 805.323 | +4.1% | +6.6% | 3.5% | 3.3% | 881.155 / 893.558 |
| reorder | 33 | 775.510 | 814.012 | +3.4% | +5.0% | 2.7% | 2.8% | 853.280 / 902.580 |
| reorder | 64 | 2412.492 | 2442.388 | +3.0% | +1.2% | 2.5% | 2.4% | 2572.055 / 2578.507 |
| reorder | 256 | 13122.660 | 13162.298 | +1.1% | +0.3% | 2.1% | 2.6% | 13833.729 / 14559.408 |
| reorder | 1024 | 58568.646 | 59997.031 | +5.2% | +2.4% | 1.8% | 2.4% | 61387.656 / 64659.453 |
| reorder | 4096 | 292627.083 | 299260.417 | -2.2% | +2.3% | 1.9% | 2.2% | 307878.000 / 320743.953 |

## Structural counts (before -> after)

| Workload | D | Link reads | Allocations | Links | Unlinks | Moves | Stable retained / eligible | Callback reads | Set delta | Physical mutations |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| stable | 0 | 1 -> 1 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 1 -> 1 / 1 | 1 -> 1 | 0 -> 0 | 0 -> 0 |
| stable | 1 | 2 -> 2 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 2 -> 2 / 2 | 2 -> 2 | 0 -> 0 | 0 -> 0 |
| stable | 16 | 17 -> 17 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 17 -> 17 / 17 | 17 -> 17 | 0 -> 0 | 0 -> 0 |
| stable | 31 | 32 -> 32 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 32 -> 32 / 32 | 32 -> 32 | 0 -> 0 | 0 -> 0 |
| stable | 32 | 33 -> 33 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 33 -> 33 / 33 | 33 -> 33 | 0 -> 0 | 0 -> 0 |
| stable | 33 | 34 -> 34 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 34 -> 34 / 34 | 34 -> 34 | 0 -> 0 | 0 -> 0 |
| stable | 64 | 65 -> 65 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 65 -> 65 / 65 | 65 -> 65 | 0 -> 0 | 0 -> 0 |
| stable | 256 | 257 -> 257 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 257 -> 257 / 257 | 257 -> 257 | 0 -> 0 | 0 -> 0 |
| stable | 1024 | 1025 -> 1025 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 1025 -> 1025 / 1025 | 1025 -> 1025 | 0 -> 0 | 0 -> 0 |
| stable | 4096 | 4097 -> 4097 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 4097 -> 4097 / 4097 | 4097 -> 4097 | 0 -> 0 | 0 -> 0 |
| alternating | 0 | 9 -> 8 | 1 -> 1 | 1 -> 1 | 1 -> 1 | 0 -> 0 | 1 -> 1 / 1 | 2 -> 2 | 2 -> 2 | 2 -> 2 |
| alternating | 1 | 16 -> 14 | 1 -> 1 | 1 -> 1 | 1 -> 1 | 1 -> 1 | 2 -> 2 / 2 | 3 -> 3 | 2 -> 2 | 3 -> 3 |
| alternating | 16 | 106 -> 89 | 1 -> 1 | 1 -> 1 | 1 -> 1 | 16 -> 16 | 17 -> 17 / 17 | 18 -> 18 | 2 -> 2 | 18 -> 18 |
| alternating | 31 | 163 -> 164 | 32 -> 1 | 32 -> 1 | 32 -> 1 | 0 -> 31 | 1 -> 32 / 32 | 33 -> 33 | 2 -> 2 | 64 -> 33 |
| alternating | 32 | 167 -> 169 | 33 -> 1 | 33 -> 1 | 33 -> 1 | 0 -> 32 | 1 -> 33 / 33 | 34 -> 34 | 2 -> 2 | 66 -> 34 |
| alternating | 33 | 171 -> 174 | 34 -> 1 | 34 -> 1 | 34 -> 1 | 0 -> 33 | 1 -> 34 / 34 | 35 -> 35 | 2 -> 2 | 68 -> 35 |
| alternating | 64 | 295 -> 329 | 65 -> 1 | 65 -> 1 | 65 -> 1 | 0 -> 64 | 1 -> 65 / 65 | 66 -> 66 | 2 -> 2 | 130 -> 66 |
| alternating | 256 | 1063 -> 1289 | 257 -> 1 | 257 -> 1 | 257 -> 1 | 0 -> 256 | 1 -> 257 / 257 | 258 -> 258 | 2 -> 2 | 514 -> 258 |
| alternating | 1024 | 4135 -> 5129 | 1025 -> 1 | 1025 -> 1 | 1025 -> 1 | 0 -> 1024 | 1 -> 1025 / 1025 | 1026 -> 1026 | 2 -> 2 | 2050 -> 1026 |
| alternating | 4096 | 16423 -> 20489 | 4097 -> 1 | 4097 -> 1 | 4097 -> 1 | 0 -> 4096 | 1 -> 4097 / 4097 | 4098 -> 4098 | 2 -> 2 | 8194 -> 4098 |
| replacement | 0 | 1 -> 1 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 1 -> 1 / 1 | 1 -> 1 | 0 -> 0 | 0 -> 0 |
| replacement | 1 | 9 -> 8 | 1 -> 1 | 1 -> 1 | 1 -> 1 | 0 -> 0 | 1 -> 1 / 1 | 2 -> 2 | 2 -> 2 | 2 -> 2 |
| replacement | 16 | 370 -> 114 | 16 -> 16 | 16 -> 16 | 16 -> 16 | 0 -> 0 | 1 -> 1 / 1 | 17 -> 17 | 32 -> 32 | 32 -> 32 |
| replacement | 31 | 1180 -> 219 | 31 -> 31 | 31 -> 31 | 31 -> 31 | 0 -> 0 | 1 -> 1 / 1 | 32 -> 32 | 62 -> 62 | 62 -> 62 |
| replacement | 32 | 163 -> 226 | 32 -> 32 | 32 -> 32 | 32 -> 32 | 0 -> 0 | 1 -> 1 / 1 | 33 -> 33 | 64 -> 64 | 64 -> 64 |
| replacement | 33 | 167 -> 233 | 33 -> 33 | 33 -> 33 | 33 -> 33 | 0 -> 0 | 1 -> 1 / 1 | 34 -> 34 | 66 -> 66 | 66 -> 66 |
| replacement | 64 | 291 -> 450 | 64 -> 64 | 64 -> 64 | 64 -> 64 | 0 -> 0 | 1 -> 1 / 1 | 65 -> 65 | 128 -> 128 | 128 -> 128 |
| replacement | 256 | 1059 -> 1794 | 256 -> 256 | 256 -> 256 | 256 -> 256 | 0 -> 0 | 1 -> 1 / 1 | 257 -> 257 | 512 -> 512 | 512 -> 512 |
| replacement | 1024 | 4131 -> 7170 | 1024 -> 1024 | 1024 -> 1024 | 1024 -> 1024 | 0 -> 0 | 1 -> 1 / 1 | 1025 -> 1025 | 2048 -> 2048 | 2048 -> 2048 |
| replacement | 4096 | 16419 -> 28674 | 4096 -> 4096 | 4096 -> 4096 | 4096 -> 4096 | 0 -> 0 | 1 -> 1 / 1 | 4097 -> 4097 | 8192 -> 8192 | 8192 -> 8192 |
| reorder | 0 | 1 -> 1 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 1 -> 1 / 1 | 1 -> 1 | 0 -> 0 | 0 -> 0 |
| reorder | 1 | 2 -> 2 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 2 -> 2 / 2 | 2 -> 2 | 0 -> 0 | 0 -> 0 |
| reorder | 16 | 123.125 -> 123.125 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 12.438 -> 12.438 | 17 -> 17 / 17 | 17 -> 17 | 0 -> 0 | 12.438 -> 12.438 |
| reorder | 31 | 425.063 -> 425.063 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 27.625 -> 27.625 | 32 -> 32 / 32 | 32 -> 32 | 0 -> 0 | 27.625 -> 27.625 |
| reorder | 32 | 454.125 -> 454.125 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 27.813 -> 27.813 | 33 -> 33 / 33 | 33 -> 33 | 0 -> 0 | 27.813 -> 27.813 |
| reorder | 33 | 480 -> 480 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 28.688 -> 28.688 | 34 -> 34 / 34 | 34 -> 34 | 0 -> 0 | 28.688 -> 28.688 |
| reorder | 64 | 1543.938 -> 1543.938 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 59.313 -> 59.313 | 65 -> 65 / 65 | 65 -> 65 | 0 -> 0 | 59.313 -> 59.313 |
| reorder | 256 | 9174.313 -> 9174.313 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 249.188 -> 249.188 | 257 -> 257 / 257 | 257 -> 257 | 0 -> 0 | 249.188 -> 249.188 |
| reorder | 1024 | 40482.250 -> 40482.250 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 1016.125 -> 1016.125 | 1025 -> 1025 / 1025 | 1025 -> 1025 | 0 -> 0 | 1016.125 -> 1016.125 |
| reorder | 4096 | 166151.250 -> 166151.250 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 4086.250 -> 4086.250 | 4097 -> 4097 / 4097 | 4097 -> 4097 | 0 -> 0 | 4086.250 -> 4086.250 |

## Interpretation

FACT: structural measurements agree exactly between the independent runs. For alternating D=64, allocations 65->1, unlinks 65->1, moves 0->64, stable retained 1->65 including tick, physical mutations 130->66, semantic delta 2->2. Link reads increase 295->329. The win is allocation/unlink avoidance, not a universal reduction in pointer reads.

FACT: alternating D>=31 is substantially faster in both runs. Stable and reorder controls have identical structural work. Small timing differences in these controls are not evidence of eliminated work.

FACT: replacement D=4096 keeps 4096 allocations, 4096 unlinks and zero moves in both versions, but link reads increase 16419->28674; it is slower in both runs. At D=31 replacement instead avoids repeated sub-threshold suffix scans: link reads 1180->219.

INFERENCE: preserving an obsolete suffix routes later complete-replacement reads through insertion/reconciliation with a nonempty suffix, instead of the baseline's completed-prefix append path. It also keeps old and new edges alive until final cleanup. These explain plausible sources of the measured regression; their individual time contributions have not been isolated.

Decision: keep the patch as an isolated measured candidate, not an unconditional release recommendation. Eliminating the remaining moves or selecting another replacement policy would require a separate experiment. No such change is included.

## Amplification (derived from existing samples; no new timing run)

A_total = (linksTraversed + physicalMutations)/(1 + dependencyDelta). A_mutation = physicalMutations/(1 + dependencyDelta). Existing linksTraversed includes sequential tracking and structural bookkeeping; A_total is not search-only overhead or a time predictor. See the semantic baseline addendum for the future search/sequence partition and order-change limitation.

| Workload | D | A_total before | A_total after | A_mutation before | A_mutation after |
| --- | ---: | ---: | ---: | ---: | ---: |
| stable | 0 | 1 | 1 | 0 | 0 |
| stable | 1 | 2 | 2 | 0 | 0 |
| stable | 16 | 17 | 17 | 0 | 0 |
| stable | 31 | 32 | 32 | 0 | 0 |
| stable | 32 | 33 | 33 | 0 | 0 |
| stable | 33 | 34 | 34 | 0 | 0 |
| stable | 64 | 65 | 65 | 0 | 0 |
| stable | 256 | 257 | 257 | 0 | 0 |
| stable | 1024 | 1025 | 1025 | 0 | 0 |
| stable | 4096 | 4097 | 4097 | 0 | 0 |
| alternating | 0 | 3.667 | 3.333 | 0.667 | 0.667 |
| alternating | 1 | 6.333 | 5.667 | 1 | 1 |
| alternating | 16 | 41.333 | 35.667 | 6 | 6 |
| alternating | 31 | 75.667 | 65.667 | 21.333 | 11 |
| alternating | 32 | 77.667 | 67.667 | 22 | 11.333 |
| alternating | 33 | 79.667 | 69.667 | 22.667 | 11.667 |
| alternating | 64 | 141.667 | 131.667 | 43.333 | 22 |
| alternating | 256 | 525.667 | 515.667 | 171.333 | 86 |
| alternating | 1024 | 2061.667 | 2051.667 | 683.333 | 342 |
| alternating | 4096 | 8205.667 | 8195.667 | 2731.333 | 1366 |
| replacement | 0 | 1 | 1 | 0 | 0 |
| replacement | 1 | 3.667 | 3.333 | 0.667 | 0.667 |
| replacement | 16 | 12.182 | 4.424 | 0.970 | 0.970 |
| replacement | 31 | 19.714 | 4.460 | 0.984 | 0.984 |
| replacement | 32 | 3.492 | 4.462 | 0.985 | 0.985 |
| replacement | 33 | 3.478 | 4.463 | 0.985 | 0.985 |
| replacement | 64 | 3.248 | 4.481 | 0.992 | 0.992 |
| replacement | 256 | 3.062 | 4.495 | 0.998 | 0.998 |
| replacement | 1024 | 3.016 | 4.499 | 1.000 | 1.000 |
| replacement | 4096 | 3.004 | 4.500 | 1.000 | 1.000 |
| reorder | 0 | 1 | 1 | 0 | 0 |
| reorder | 1 | 2 | 2 | 0 | 0 |
| reorder | 16 | 135.563 | 135.563 | 12.438 | 12.438 |
| reorder | 31 | 452.688 | 452.688 | 27.625 | 27.625 |
| reorder | 32 | 481.938 | 481.938 | 27.813 | 27.813 |
| reorder | 33 | 508.688 | 508.688 | 28.688 | 28.688 |
| reorder | 64 | 1603.250 | 1603.250 | 59.313 | 59.313 |
| reorder | 256 | 9423.500 | 9423.500 | 249.188 | 249.188 |
| reorder | 1024 | 41498.375 | 41498.375 | 1016.125 | 1016.125 |
| reorder | 4096 | 170237.500 | 170237.500 | 4086.250 | 4086.250 |
