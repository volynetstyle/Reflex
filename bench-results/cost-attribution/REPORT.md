# Cost-attribution report

Structural counters (event counts per iteration) and wall-clock ns/op are
collected in separate runs — structural under a build with __PROFILE__
compiled in, timing under a build with __PROFILE__ compiled out — and
joined here by config key. Bucket columns are **event counts per
operation**, not cost shares: no percentage in this report claims a
fraction of runtime, because no per-event cost has been independently
calibrated. 'Dominant' means the bucket with the most events at that grid
point. Regime boundaries are reported where the dominant bucket changes,
with the wall-clock ratio across the same interval noted as
corroboration (or lack of it) — not as a cost split.

### depth

| axis value | push | pull | trackingFast | trackingReconcile | advance | watcher | cleanup | dominant | ns/op | push depth | pull depth |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 0 | 1 | 0 | 2 | 0 | 0 | advance | 10711.00 | 1 | 0 |
| 2 | 2 | 1 | 2 | 0 | 4 | 0 | 0 | advance | 21486.67 | 2 | 1 |
| 4 | 4 | 5 | 4 | 0 | 8 | 0 | 0 | advance | 40016.00 | 4 | 3 |
| 8 | 8 | 13 | 8 | 0 | 16 | 0 | 0 | advance | 75881.00 | 8 | 7 |
| 16 | 16 | 29 | 16 | 0 | 32 | 0 | 0 | advance | 154696.67 | 16 | 15 |
| 32 | 32 | 61 | 32 | 0 | 64 | 0 | 0 | advance | 303136.67 | 32 | 31 |
| 64 | 64 | 125 | 64 | 0 | 128 | 0 | 0 | advance | 592370.67 | 64 | 63 |
| 128 | 128 | 253 | 128 | 0 | 256 | 0 | 0 | advance | 1238383.33 | 128 | 127 |
| 256 | 256 | 509 | 256 | 0 | 512 | 0 | 0 | advance | 2474316.25 | 256 | 255 |
| 512 | 512 | 1021 | 512 | 0 | 1024 | 0 | 0 | advance | 4820462.50 | 512 | 511 |

No event-count-dominance change across this grid — advance stays dominant throughout.

### fanout

| axis value | push | pull | trackingFast | trackingReconcile | advance | watcher | cleanup | dominant | ns/op | push depth | pull depth |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2 | 1 | 2 | 0 | 4 | 0 | 0 | advance | 22460.67 | 2 | 1 |
| 4 | 11 | 1 | 8 | 0 | 10 | 0 | 0 | push | 76387.33 | 2 | 1 |
| 16 | 47 | 1 | 32 | 0 | 34 | 0 | 0 | push | 210883.33 | 2 | 1 |
| 64 | 191 | 1 | 128 | 0 | 130 | 0 | 0 | push | 821156.33 | 2 | 1 |
| 192 | 575 | 1 | 384 | 0 | 386 | 0 | 0 | push | 2459886 | 2 | 1 |
| 512 | 1535 | 1 | 1024 | 0 | 1026 | 0 | 0 | push | 6722933.75 | 2 | 1 |
| 1024 | 3071 | 1 | 2048 | 0 | 2050 | 0 | 0 | push | 13020706.67 | 2 | 1 |
| 2048 | 6143 | 1 | 4096 | 0 | 4098 | 0 | 0 | push | 26389593.33 | 2 | 1 |

Regime boundaries (event-count dominance switch):

- between axis=1 and axis=4: dominant bucket switches advance -> push (ns/op grew 3.40x over the same interval — corroborates a real cost shift)

### fanin

| axis value | push | pull | trackingFast | trackingReconcile | advance | watcher | cleanup | dominant | ns/op | push depth | pull depth |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 0 | 1 | 0 | 2 | 0 | 0 | advance | 12348.33 | 1 | 0 |
| 4 | 1 | 0 | 4 | 0 | 2 | 0 | 0 | trackingFast | 22680.33 | 1 | 0 |
| 16 | 1 | 0 | 16 | 0 | 2 | 0 | 0 | trackingFast | 65168.33 | 1 | 0 |
| 64 | 1 | 0 | 64 | 0 | 2 | 0 | 0 | trackingFast | 222791.33 | 1 | 0 |
| 192 | 1 | 0 | 192 | 0 | 2 | 0 | 0 | trackingFast | 636464.00 | 1 | 0 |
| 512 | 1 | 0 | 512 | 0 | 2 | 0 | 0 | trackingFast | 1753711.25 | 1 | 0 |
| 1024 | 1 | 0 | 1024 | 0 | 2 | 0 | 0 | trackingFast | 3581276.67 | 1 | 0 |
| 2048 | 1 | 0 | 2048 | 0 | 2 | 0 | 0 | trackingFast | 6894746.67 | 1 | 0 |

Regime boundaries (event-count dominance switch):

- between axis=1 and axis=4: dominant bucket switches advance -> trackingFast (ns/op grew 1.84x over the same interval — corroborates a real cost shift)

### width

| axis value | push | pull | trackingFast | trackingReconcile | advance | watcher | cleanup | dominant | ns/op | push depth | pull depth |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 8 | 1 | 0 | 8 | 0 | 2 | 0 | 0 | trackingFast | 34905.67 | 1 | 0 |
| 32 | 1 | 0 | 32 | 0 | 2 | 0 | 0 | trackingFast | 112664.67 | 1 | 0 |
| 128 | 1 | 0 | 128 | 0 | 2 | 0 | 0 | trackingFast | 427425.67 | 1 | 0 |
| 512 | 1 | 0 | 512 | 0 | 2 | 0 | 0 | trackingFast | 1737438.75 | 1 | 0 |
| 2048 | 1 | 0 | 2048 | 0 | 2 | 0 | 0 | trackingFast | 7169766.67 | 1 | 0 |

No event-count-dominance change across this grid — trackingFast stays dominant throughout.

### churn

| axis value | push | pull | trackingFast | trackingReconcile | advance | watcher | cleanup | dominant | ns/op | push depth | pull depth |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 1.57 | 0 | 129 | 0 | 2 | 0 | 0 | trackingFast | 830809.33 | 1 | 0 |
| 0.01 | 2 | 0 | 128.01 | 16.72 | 2.00 | 0 | 0.00 | trackingFast | 918147.67 | 1 | 0 |
| 0.1 | 2 | 0 | 128.05 | 17.88 | 2.04 | 0 | 0.04 | trackingFast | 910558.00 | 1 | 0 |
| 0.5 | 2 | 0 | 128.26 | 22.39 | 2.26 | 0 | 0.26 | trackingFast | 917500.33 | 1 | 0 |
| 1 | 2 | 0 | 128 | 3 | 3 | 0 | 1 | trackingFast | 910955.00 | 1 | 0 |

No event-count-dominance change across this grid — trackingFast stays dominant throughout.

Timing anomalies (ns/op decreased despite an equal-or-larger axis value — treat as measurement noise, not a finding):

- axis=0.01 (918147.67 ns/op) -> axis=0.1 (910558.00 ns/op)
- axis=0.5 (917500.33 ns/op) -> axis=1 (910955.00 ns/op)

### semantic

| axis value | push | pull | trackingFast | trackingReconcile | advance | watcher | cleanup | dominant | ns/op | push depth | pull depth |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 256 | 255 | 128 | 0 | 256 | 0 | 0 | push | 2416863.00 | 2 | 1 |
| 0.25 | 287.75 | 191.50 | 160 | 0 | 256.50 | 0 | 0 | push | 2657222.67 | 2 | 1 |
| 0.5 | 319.50 | 128 | 192 | 0 | 257 | 0 | 0 | push | 2883369.67 | 2 | 1 |
| 0.75 | 351.25 | 64.50 | 224 | 0 | 257.50 | 0 | 0 | push | 1512196.00 | 2 | 1 |
| 1 | 383 | 1 | 256 | 0 | 258 | 0 | 0 | push | 1598986.33 | 2 | 1 |

No event-count-dominance change across this grid — push stays dominant throughout.

Timing anomalies (ns/op decreased despite an equal-or-larger axis value — treat as measurement noise, not a finding):

- axis=0.5 (2883369.67 ns/op) -> axis=0.75 (1512196.00 ns/op)

### locality

| axis value | push | pull | trackingFast | trackingReconcile | advance | watcher | cleanup | dominant | ns/op | push depth | pull depth |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| distant-reuse | 2 | 0 | 130 | 0 | 2 | 0 | 0 | trackingFast | 421385.00 | 1 | 0 |
| duplicate-reads | 2 | 0 | 130 | 0 | 2 | 0 | 0 | trackingFast | 432484.00 | 1 | 0 |
| permutation | 2 | 0 | 129 | 0 | 2 | 0 | 0 | trackingFast | 421000.00 | 1 | 0 |
| stable | 2 | 0 | 129 | 0 | 2 | 0 | 0 | trackingFast | 428278.67 | 1 | 0 |

No event-count-dominance change across this grid — trackingFast stays dominant throughout.

Timing anomalies (ns/op decreased despite an equal-or-larger axis value — treat as measurement noise, not a finding):

- axis=duplicate-reads (432484.00 ns/op) -> axis=permutation (421000.00 ns/op)

### churnByWidth (interaction)

secondary axis = 32

| axis value | dominant bucket | ns/op |
| --- | --- | --- |
| 0 | trackingFast | 118325.00 |
| 0.01 | trackingFast | 112478.00 |
| 0.1 | trackingFast | 119854.33 |
| 0.5 | trackingFast | 125587.00 |
| 1 | trackingFast | 121786.00 |

secondary axis = 128

| axis value | dominant bucket | ns/op |
| --- | --- | --- |
| 0 | trackingFast | 459151.67 |
| 0.01 | trackingFast | 492064.67 |
| 0.1 | trackingFast | 913155.67 |
| 0.5 | trackingFast | 915415.33 |
| 1 | trackingFast | 919438.00 |

secondary axis = 512

| axis value | dominant bucket | ns/op |
| --- | --- | --- |
| 0 | trackingFast | 3446068.75 |
| 0.01 | trackingFast | 3488681.25 |
| 0.1 | trackingFast | 3469308.75 |
| 0.5 | trackingFast | 3545193.75 |
| 1 | trackingFast | 3517408.75 |

### fanoutBySemantic (interaction)

secondary axis = 16

| axis value | dominant bucket | ns/op |
| --- | --- | --- |
| 0 | push | 309821.33 |
| 0.25 | push | 343007.00 |
| 0.5 | push | 376007.00 |
| 0.75 | push | 408221.33 |
| 1 | push | 439410.33 |

secondary axis = 192

| axis value | dominant bucket | ns/op |
| --- | --- | --- |
| 0 | push | 3573871.33 |
| 0.25 | push | 3907746.33 |
| 0.5 | push | 4260925.67 |
| 0.75 | push | 4614755.67 |
| 1 | push | 4956461.00 |

secondary axis = 1024

| axis value | dominant bucket | ns/op |
| --- | --- | --- |
| 0 | push | 18934523.33 |
| 0.25 | push | 9980166.67 |
| 0.5 | push | 11041466.67 |
| 0.75 | push | 11488440.00 |
| 1 | push | 13150526.67 |

## Stack-capacity threshold investigation

pull_iterator.ts truncates its walker stack back to STACK_TRIM_MIN_CAPACITY
(256) after every top-level call that exceeded it; push_iterator.ts does the
same to `propagateStack` at MAX_RETAINED_PROPAGATE_STACK (512). These are two
separate arrays on two separate sides of the runtime (pull vs. push), not one
shared structure — this section checks empirically whether a chain-depth
cliff lands at 256 and a wide-fanout cliff lands at 512, or whether "512"
generalizes across both.

### depthPullThreshold (chain depth, pull stack)

| axis value | trim events/op | avg excess/trim | peak stack usage | ns/op | ns/op vs prev |
| --- | --- | --- | --- | --- | --- |
| 192 | 0 | 0 | 190 | 3577686.67 | - |
| 224 | 0 | 0 | 222 | 4087898.00 | 1.14x |
| 240 | 0 | 0 | 238 | 4375449.33 | 1.07x |
| 248 | 0 | 0 | 246 | 4521499.33 | 1.03x |
| 252 | 0 | 0 | 250 | 4632637.33 | 1.02x |
| 254 | 0 | 0 | 252 | 4644268.33 | 1.00x |
| 255 | 0 | 0 | 253 | 4653772.67 | 1.00x |
| 256 | 0 | 0 | 254 | 4667502.50 | 1.00x |
| 257 | 0 | 0 | 255 | 4715557.50 | 1.01x |
| 258 | 0 | 0 | 256 | 4718718.75 | 1.00x |
| 260 | 1 | 2 | 258 | 4747201.25 | 1.01x |
| 264 | 1 | 6 | 262 | 4862977.50 | 1.02x |
| 272 | 1 | 14 | 270 | 5034822.50 | 1.04x |
| 288 | 1 | 30 | 286 | 5259463.75 | 1.04x |
| 320 | 1 | 62 | 318 | 5845276.25 | 1.11x |
| 384 | 1 | 126 | 382 | 7050552.50 | 1.21x |
| 448 | 1 | 190 | 446 | 8218096.25 | 1.17x |
| 512 | 1 | 254 | 510 | 4818300.00 | 0.59x |

Empirical trim-onset: axis=260 is the first grid point where trim events/op >= 0.5 (source-level threshold constant = 256).

### fanoutPushThreshold (fanout, push stack)

| axis value | trim events/op | avg excess/trim | peak stack usage | ns/op | ns/op vs prev |
| --- | --- | --- | --- | --- | --- |
| 384 | 0 | 0 | 383 | 4902315.00 | - |
| 448 | 0 | 0 | 447 | 5834818.75 | 1.19x |
| 480 | 0 | 0 | 479 | 12784710.00 | 2.19x |
| 496 | 0 | 0 | 495 | 13096140.00 | 1.02x |
| 504 | 0 | 0 | 503 | 13322927.50 | 1.02x |
| 508 | 0 | 0 | 507 | 13294891.25 | 1.00x |
| 510 | 0 | 0 | 509 | 13386637.50 | 1.01x |
| 511 | 0 | 0 | 510 | 13326402.50 | 1.00x |
| 512 | 0 | 0 | 511 | 13285982.50 | 1.00x |
| 513 | 1 | 1 | 512 | 13279416.25 | 1.00x |
| 514 | 1 | 2 | 513 | 13281911.25 | 1.00x |
| 516 | 1 | 4 | 515 | 6737011.25 | 0.51x |
| 520 | 1 | 8 | 519 | 6772655.00 | 1.01x |
| 528 | 1 | 16 | 527 | 6750403.75 | 1.00x |
| 544 | 1 | 32 | 543 | 7053236.25 | 1.04x |
| 576 | 1 | 64 | 575 | 7586106.25 | 1.08x |
| 640 | 1 | 128 | 639 | 8327847.50 | 1.10x |
| 768 | 1 | 256 | 767 | 10147102.50 | 1.22x |
| 1024 | 1 | 512 | 1023 | 13326450.00 | 1.31x |

Empirical trim-onset: axis=513 is the first grid point where trim events/op >= 0.5 (source-level threshold constant = 512).

### depthFineCliff (every integer depth 244-262, fixed 200 iterations)

Re-measures the 252->254 jump seen in depthPullThreshold with iteration
count held constant, since iterationsFor() itself changes (300 -> 80) at
depth=256 in that sweep — a confound in the harness, not the runtime.

### depthFineCliff

| axis value | trim events/op | avg excess/trim | peak stack usage | ns/op | ns/op vs prev |
| --- | --- | --- | --- | --- | --- |
| 244 | 0 | 0 | 242 | 2283161.00 | - |
| 245 | 0 | 0 | 243 | 2260802.00 | 0.99x |
| 246 | 0 | 0 | 244 | 2276208.50 | 1.01x |
| 247 | 0 | 0 | 245 | 2326563.00 | 1.02x |
| 248 | 0 | 0 | 246 | 2313488.00 | 0.99x |
| 249 | 0 | 0 | 247 | 2291140.50 | 0.99x |
| 250 | 0 | 0 | 248 | 2300460.50 | 1.00x |
| 251 | 0 | 0 | 249 | 2234004.50 | 0.97x |
| 252 | 0 | 0 | 250 | 2288479.50 | 1.02x |
| 253 | 0 | 0 | 251 | 2383542.00 | 1.04x |
| 254 | 0 | 0 | 252 | 2407044.00 | 1.01x |
| 255 | 0 | 0 | 253 | 2381324.00 | 0.99x |
| 256 | 0 | 0 | 254 | 2362360.00 | 0.99x |
| 257 | 0 | 0 | 255 | 2385070.50 | 1.01x |
| 258 | 0 | 0 | 256 | 2388029.00 | 1.00x |
| 259 | 1 | 1 | 257 | 2392561.00 | 1.00x |
| 260 | 1 | 2 | 258 | 2306256.50 | 0.96x |
| 261 | 1 | 3 | 259 | 2436585.50 | 1.06x |
| 262 | 1 | 4 | 260 | 2463989.50 | 1.01x |

Empirical trim-onset: axis=259 is the first grid point where trim events/op >= 0.5 (source-level threshold constant = 256).

### semanticFixedFanout1024

fanout is fixed at 1024 (> 512, so every point is already past the push-side
trim threshold). If pushStackTrimEvents/op is ~constant across ratio here, the
capacity-trim mechanism cannot be what makes ns/op vary with ratio — any
variation has a different cause.

| ratio | push trim events/op | ns/op | ns/op vs ratio=0 |
| --- | --- | --- | --- |
| 0 | 1 | 9775213.33 | 1.00x |
| 0.25 | 1 | 10660882.00 | 1.09x |
| 0.5 | 1 | 11662515.33 | 1.19x |
| 0.75 | 1 | 12460305.33 | 1.27x |
| 1 | 1 | 13401750.67 | 1.37x |

Trim-event rate is constant (spread < 0.1) across ratio, as expected — confirms the capacity mechanism is ratio-invariant here.
