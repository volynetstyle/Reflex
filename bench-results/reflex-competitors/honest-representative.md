# Reflex competitor benchmark

Generated: 2026-09-22T10:20:16.434Z on v25.2.0 / 14.1.146.11-node.13

Medians are across fresh-process trials. `vs Reflex` is the median of same-trial throughput ratios; values below 1 are slower than Reflex. Ratios are withheld for failed or capability-incompatible runs.

| Scenario | Size | Framework | Trials | ops/s | MAD % | computed/op | effects/op | p99 ns | p999 ns | vs Reflex | Status |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| changed-leaf | 1 | Reflex working tree | 5/5 | 25633569 | 0.52 | 0.00 | 1.00 | 300 | n/a | 1.000 | comparable |
| changed-leaf | 1 | Reflex e87bb66 | 5/5 | 27311849 | 0.72 | 0.00 | 1.00 | 300 | n/a | 1.069 | comparable |
| changed-leaf | 1 | alien-signals 3.2.1 | 5/5 | 30152428 | 0.37 | 0.00 | 1.00 | 300 | n/a | 1.176 | comparable |
| changed-leaf | 1 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 4109425 | 1.95 | 0.00 | 1.00 | 900 | n/a | 0.160 | comparable |
| changed-leaf | 1 | @vue/reactivity 3.5.43 | 5/5 | 24567833 | 1.91 | 0.00 | 1.00 | 300 | n/a | 0.959 | comparable |
| diamond-fan-in | 16 | Reflex working tree | 5/5 | 1920003 | 1.15 | 17.00 | 1.00 | 1200 | n/a | 1.000 | comparable |
| diamond-fan-in | 16 | Reflex e87bb66 | 5/5 | 1913484 | 0.65 | 17.00 | 1.00 | 1200 | n/a | 0.998 | comparable |
| diamond-fan-in | 16 | alien-signals 3.2.1 | 5/5 | 2185954 | 0.44 | 17.00 | 1.00 | 2300 | n/a | 1.135 | comparable |
| diamond-fan-in | 16 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 312701 | 0.69 | 17.00 | 1.00 | 5200 | n/a | 0.162 | comparable |
| diamond-fan-in | 16 | @vue/reactivity 3.5.43 | 5/5 | 998500 | 2.24 | 17.00 | 1.00 | 1900 | n/a | 0.507 | comparable |
| mostly-dirty | 16 | Reflex working tree | 5/5 | 2478483 | 1.19 | 1.00 | 1.00 | 1100 | n/a | 1.000 | comparable |
| mostly-dirty | 16 | Reflex e87bb66 | 5/5 | 2431319 | 0.18 | 1.00 | 1.00 | 1100 | n/a | 0.983 | comparable |
| mostly-dirty | 16 | alien-signals 3.2.1 | 5/5 | 2510597 | 0.59 | 1.00 | 1.00 | 900 | n/a | 1.009 | comparable |
| mostly-dirty | 16 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 798566 | 1.22 | 1.00 | 1.00 | 2900 | n/a | 0.326 | comparable |
| mostly-dirty | 16 | @vue/reactivity 3.5.43 | 5/5 | 211376 | 2.10 | 12.00 | 12.00 | 6400 | n/a | n/a | not comparable: Scenario requires publicBatch for equal public observable work |
| wide-fanout | 1 | Reflex working tree | 5/5 | 16792937 | 2.11 | 1.00 | 1.00 | 400 | n/a | 1.000 | comparable |
| wide-fanout | 1 | Reflex e87bb66 | 5/5 | 15438014 | 3.12 | 1.00 | 1.00 | 400 | n/a | 0.906 | comparable |
| wide-fanout | 1 | alien-signals 3.2.1 | 5/5 | 17627691 | 0.72 | 1.00 | 1.00 | 400 | n/a | 1.048 | comparable |
| wide-fanout | 1 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 2361532 | 1.04 | 1.00 | 1.00 | 1100 | n/a | 0.139 | comparable |
| wide-fanout | 1 | @vue/reactivity 3.5.43 | 5/5 | 11727628 | 5.11 | 1.00 | 1.00 | 500 | n/a | 0.698 | comparable |
| wide-fanout | 16 | Reflex working tree | 5/5 | 1240381 | 1.75 | 16.00 | 16.00 | 1800 | n/a | 1.000 | comparable |
| wide-fanout | 16 | Reflex e87bb66 | 5/5 | 1184746 | 1.91 | 16.00 | 16.00 | 2400 | n/a | 0.956 | comparable |
| wide-fanout | 16 | alien-signals 3.2.1 | 5/5 | 1265924 | 1.00 | 16.00 | 16.00 | 1600 | n/a | 1.015 | comparable |
| wide-fanout | 16 | @solidjs/signals 2.0.0-rc.9 | 5/5 | 224526 | 1.61 | 16.00 | 16.00 | 6200 | n/a | 0.179 | comparable |
| wide-fanout | 16 | @vue/reactivity 3.5.43 | 5/5 | 868909 | 3.76 | 16.00 | 16.00 | 2500 | n/a | 0.696 | comparable |

## Observable-equivalence failures

- changed-leaf/1/trial-0: reflex-e87bb66=8236594, alien=10341874
- changed-leaf/1/trial-0: reflex-e87bb66=8236594, solid2=1311218
- changed-leaf/1/trial-0: reflex-e87bb66=8236594, vue=8528562
- changed-leaf/1/trial-0: reflex-e87bb66=8236594, reflex=8456434
- wide-fanout/1/trial-0: alien=5889458, solid2=739570
- wide-fanout/1/trial-0: alien=5889458, vue=3874866
- wide-fanout/1/trial-0: alien=5889458, reflex=5711474
- wide-fanout/1/trial-0: alien=5889458, reflex-e87bb66=5160754
- wide-fanout/16/trial-0: alien=6946712, solid2=1201048
- wide-fanout/16/trial-0: alien=6946712, vue=4513688
- wide-fanout/16/trial-0: alien=6946712, reflex=6971288
- wide-fanout/16/trial-0: alien=6946712, reflex-e87bb66=6368152
- diamond-fan-in/16/trial-0: solid2=1608600, vue=5229464
- diamond-fan-in/16/trial-0: solid2=1608600, reflex=10548120
- diamond-fan-in/16/trial-0: solid2=1608600, reflex-e87bb66=10638232
- diamond-fan-in/16/trial-0: solid2=1608600, alien=12082072
- mostly-dirty/16/trial-0: vue=827856, reflex=10013904
- mostly-dirty/16/trial-0: vue=827856, reflex-e87bb66=9933264
- mostly-dirty/16/trial-0: vue=827856, alien=10072272
- mostly-dirty/16/trial-0: vue=827856, solid2=3121104
- changed-leaf/1/trial-1: alien=10348594, solid2=1343282
- changed-leaf/1/trial-1: alien=10348594, vue=8397298
- changed-leaf/1/trial-1: alien=10348594, reflex=8658098
- changed-leaf/1/trial-1: alien=10348594, reflex-e87bb66=8862962
- wide-fanout/1/trial-1: solid2=732914, vue=4079090
- wide-fanout/1/trial-1: solid2=732914, reflex=5143218
- wide-fanout/1/trial-1: solid2=732914, reflex-e87bb66=5170482
- wide-fanout/1/trial-1: solid2=732914, alien=5844786
- wide-fanout/16/trial-1: solid2=1237912, vue=4651928
- wide-fanout/16/trial-1: solid2=1237912, reflex=6517656
- wide-fanout/16/trial-1: solid2=1237912, reflex-e87bb66=6502296
- wide-fanout/16/trial-1: solid2=1237912, alien=6638488
- diamond-fan-in/16/trial-1: vue=5014424, reflex=10348440
- diamond-fan-in/16/trial-1: vue=5014424, reflex-e87bb66=10274712
- diamond-fan-in/16/trial-1: vue=5014424, alien=11767704
- diamond-fan-in/16/trial-1: vue=5014424, solid2=1642392
- mostly-dirty/16/trial-1: reflex=10199760, reflex-e87bb66=9387984
- mostly-dirty/16/trial-1: reflex=10199760, alien=9947088
- mostly-dirty/16/trial-1: reflex=10199760, solid2=3256272
- mostly-dirty/16/trial-1: reflex=10199760, vue=883920
- changed-leaf/1/trial-2: solid2=1328434, vue=8508594
- changed-leaf/1/trial-2: solid2=1328434, reflex=8847282
- changed-leaf/1/trial-2: solid2=1328434, reflex-e87bb66=9196786
- changed-leaf/1/trial-2: solid2=1328434, alien=10366450
- wide-fanout/1/trial-2: vue=4094066, reflex=5702066
- wide-fanout/1/trial-2: vue=4094066, reflex-e87bb66=5137714
- wide-fanout/1/trial-2: vue=4094066, alien=6080114
- wide-fanout/1/trial-2: vue=4094066, solid2=781362
- wide-fanout/16/trial-2: vue=4964248, reflex=6671256
- wide-fanout/16/trial-2: vue=4964248, reflex-e87bb66=6434712
- wide-fanout/16/trial-2: vue=4964248, alien=6831000
- wide-fanout/16/trial-2: vue=4964248, solid2=1184664
- diamond-fan-in/16/trial-2: reflex=10191768, reflex-e87bb66=10160024
- diamond-fan-in/16/trial-2: reflex=10191768, alien=12088216
- diamond-fan-in/16/trial-2: reflex=10191768, solid2=1636248
- diamond-fan-in/16/trial-2: reflex=10191768, vue=5461912
- mostly-dirty/16/trial-2: reflex-e87bb66=9798864, alien=10082256
- mostly-dirty/16/trial-2: reflex-e87bb66=9798864, solid2=3147216
- mostly-dirty/16/trial-2: reflex-e87bb66=9798864, vue=890832
- mostly-dirty/16/trial-2: reflex-e87bb66=9798864, reflex=9767376
- changed-leaf/1/trial-3: vue=8423026, reflex=8919602
- changed-leaf/1/trial-3: vue=8423026, reflex-e87bb66=9670514
- changed-leaf/1/trial-3: vue=8423026, alien=10501042
- changed-leaf/1/trial-3: vue=8423026, solid2=1355378
- wide-fanout/1/trial-3: reflex=5549234, reflex-e87bb66=4948850
- wide-fanout/1/trial-3: reflex=5549234, alien=6087794
- wide-fanout/1/trial-3: reflex=5549234, solid2=777266
- wide-fanout/1/trial-3: reflex=5549234, vue=3766578
- wide-fanout/16/trial-3: reflex=6778776, reflex-e87bb66=6085528
- wide-fanout/16/trial-3: reflex=6778776, alien=7027608
- wide-fanout/16/trial-3: reflex=6778776, solid2=1215384
- wide-fanout/16/trial-3: reflex=6778776, vue=4693912
- diamond-fan-in/16/trial-3: reflex-e87bb66=10225560, alien=11656088
- diamond-fan-in/16/trial-3: reflex-e87bb66=10225560, solid2=1755032
- diamond-fan-in/16/trial-3: reflex-e87bb66=10225560, vue=5181336
- diamond-fan-in/16/trial-3: reflex-e87bb66=10225560, reflex=10333080
- mostly-dirty/16/trial-3: alien=10245072, solid2=3196368
- mostly-dirty/16/trial-3: alien=10245072, vue=851664
- mostly-dirty/16/trial-3: alien=10245072, reflex=10351824
- mostly-dirty/16/trial-3: alien=10245072, reflex-e87bb66=9765072
- changed-leaf/1/trial-4: reflex=8655090, reflex-e87bb66=9241778
- changed-leaf/1/trial-4: reflex=8655090, alien=10117362
- changed-leaf/1/trial-4: reflex=8655090, solid2=1385714
- changed-leaf/1/trial-4: reflex=8655090, vue=7794482
- wide-fanout/1/trial-4: reflex-e87bb66=4824178, alien=6077682
- wide-fanout/1/trial-4: reflex-e87bb66=4824178, solid2=775602
- wide-fanout/1/trial-4: reflex-e87bb66=4824178, vue=3686322
- wide-fanout/1/trial-4: reflex-e87bb66=4824178, reflex=5990770
- wide-fanout/16/trial-4: reflex-e87bb66=6144920, alien=6717336
- wide-fanout/16/trial-4: reflex-e87bb66=6144920, solid2=1226648
- wide-fanout/16/trial-4: reflex-e87bb66=6144920, vue=4903832
- wide-fanout/16/trial-4: reflex-e87bb66=6144920, reflex=6493080
- diamond-fan-in/16/trial-4: alien=11856792, solid2=1648536
- diamond-fan-in/16/trial-4: alien=11856792, vue=5402520
- diamond-fan-in/16/trial-4: alien=11856792, reflex=10587032
- diamond-fan-in/16/trial-4: alien=11856792, reflex-e87bb66=9997208
- mostly-dirty/16/trial-4: solid2=3224016, vue=868560
- mostly-dirty/16/trial-4: solid2=3224016, reflex=9907920
- mostly-dirty/16/trial-4: solid2=3224016, reflex-e87bb66=9846480
- mostly-dirty/16/trial-4: solid2=3224016, alien=10364112

Heap deltas and GC observations are diagnostics retained in JSON/CSV, not allocation measurements. Raw phase-separated work counters and failures are retained in JSON.
