# Liveness comparison: Reflex vs Angular vs Preact

2026-10-15T15:50:48.066Z · node v25.2.0 · 5 fresh-process trials per cell (median, [min–max]).

- Reflex (facade, working tree)
- @angular/core 22.2.0 primitives/signals
- @preact/signals-core 1.14.4

DAG: 64 producers, 4×512 computeds (fan-in 3), 256 watchers × 3 top-layer reads, 64 unrelated signals. Same lifetime contract everywhere: computed handles live for the whole run, effects are disposed explicitly. Every run is checked against a plain-JS reference; observed sums must match across frameworks.

Structural counters, per operation: `alloc` dependency links allocated; `sub`/`unsub` insertions/removals in subscriber lists (for Reflex every edge is a subscriber-list member); `poll` dependency links inspected for freshness (Reflex: pull/frontier edges); `notify` subscriber links visited by propagation; `computes`/`effects` user callbacks.

## observer-toggle

| param | phase | framework | time/op | alloc | sub | unsub | poll | notify | computes | effects |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| toggleShare=1,writesPerCycle=0 | cycle | reflex | 96.6 µs [93.2 µs–182.6 µs] | 768 | 768 | 768 | 0 | 0 | 0 | 256 |
| toggleShare=1,writesPerCycle=0 | cycle | angular | 488.5 µs [449.6 µs–564.6 µs] | 768 | 6198 | 6198 | 0 | 0 | 0 | 256 |
| toggleShare=1,writesPerCycle=0 | cycle | preact | 332.3 µs [323.4 µs–342.1 µs] | 768 | 6184 | 6184 | 0 | 0 | 0 | 256 |
| toggleShare=1,writesPerCycle=1 | cycle | reflex | 197.4 µs [178.2 µs–224.8 µs] | 768 | 768 | 768 | 289.9 | 1084.3 | 513.3 | 256 |
| toggleShare=1,writesPerCycle=1 | cycle | angular | 910.4 µs [828.6 µs–1.55 ms] | 768 | 6198 | 6198 | 4824.5 | 0 | 513.3 | 256 |
| toggleShare=1,writesPerCycle=1 | cycle | preact | 440.6 µs [415.8 µs–703.1 µs] | 768 | 6184 | 6184 | 4812.5 | 0 | 513.3 | 256 |
| toggleShare=1,writesPerCycle=10 | cycle | reflex | 322.7 µs [311.2 µs–561.3 µs] | 768 | 768 | 768 | 334.8 | 4890.9 | 1400.8 | 256 |
| toggleShare=1,writesPerCycle=10 | cycle | angular | 1.12 ms [976.7 µs–2.58 ms] | 768 | 6198 | 6198 | 3182.3 | 0 | 1400.8 | 256 |
| toggleShare=1,writesPerCycle=10 | cycle | preact | 533.0 µs [497.0 µs–760.0 µs] | 768 | 6184 | 6184 | 3176.1 | 0 | 1400.8 | 256 |
| toggleShare=0.25,writesPerCycle=1 | cycle | reflex | 169.9 µs [161.8 µs–231.5 µs] | 192 | 192 | 192 | 842.5 | 1650.5 | 513.3 | 249.8 |
| toggleShare=0.25,writesPerCycle=1 | cycle | angular | 333.1 µs [319.7 µs–475.8 µs] | 192 | 401 | 401 | 1272.1 | 1011.4 | 513.3 | 249.8 |
| toggleShare=0.25,writesPerCycle=1 | cycle | preact | 187.0 µs [177.3 µs–300.6 µs] | 192 | 401 | 401 | 1272.1 | 1010.2 | 513.3 | 249.8 |

## standalone-reads

| param | phase | framework | time/op | alloc | sub | unsub | poll | notify | computes | effects |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| readsPerUnrelatedWrite=0 | read | reflex | 49 ns [42 ns–62 ns] | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| readsPerUnrelatedWrite=0 | read | angular | 71 ns [58 ns–149 ns] | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| readsPerUnrelatedWrite=0 | read | preact | 60 ns [49 ns–76 ns] | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| readsPerUnrelatedWrite=100 | read | reflex | 60 ns [57 ns–63 ns] | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| readsPerUnrelatedWrite=100 | read | angular | 873 ns [802 ns–930 ns] | 0 | 0 | 0 | 33.4 | 0 | 0 | 0 |
| readsPerUnrelatedWrite=100 | read | preact | 421 ns [411 ns–515 ns] | 0 | 0 | 0 | 33.3 | 0 | 0 | 0 |
| readsPerUnrelatedWrite=10 | read | reflex | 87 ns [72 ns–94 ns] | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| readsPerUnrelatedWrite=10 | read | angular | 1.9 µs [1.8 µs–1.9 µs] | 0 | 0 | 0 | 92.9 | 0 | 0 | 0 |
| readsPerUnrelatedWrite=10 | read | preact | 787 ns [723 ns–1.0 µs] | 0 | 0 | 0 | 92.5 | 0 | 0 | 0 |
| readsPerUnrelatedWrite=1 | read | reflex | 130 ns [119 ns–199 ns] | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| readsPerUnrelatedWrite=1 | read | angular | 2.8 µs [2.6 µs–3.1 µs] | 0 | 0 | 0 | 115.9 | 0 | 0 | 0 |
| readsPerUnrelatedWrite=1 | read | preact | 814 ns [751 ns–864 ns] | 0 | 0 | 0 | 115.4 | 0 | 0 | 0 |

## dormant-writes

| param | phase | framework | time/op | alloc | sub | unsub | poll | notify | computes | effects |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| dormantWrites=100 | deactivate | reflex | 77.9 µs [66.7 µs–101.0 µs] | 0 | 0 | 768 | 0 | 0 | 0 | 0 |
| dormantWrites=100 | deactivate | angular | 484.7 µs [449.0 µs–608.6 µs] | 0 | 0 | 6198 | 0 | 0 | 0 | 0 |
| dormantWrites=100 | deactivate | preact | 265.3 µs [253.5 µs–325.0 µs] | 0 | 0 | 6184 | 0 | 0 | 0 | 0 |
| dormantWrites=100 | dormant-write | reflex | 1.4 µs [1.4 µs–1.8 µs] | 0 | 0 | 0 | 0 | 61.8 | 0 | 0 |
| dormantWrites=100 | dormant-write | angular | 397 ns [379 ns–497 ns] | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| dormantWrites=100 | dormant-write | preact | 294 ns [284 ns–306 ns] | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| dormantWrites=100 | reactivate | reflex | 656.6 µs [652.9 µs–831.6 µs] | 768 | 768 | 0 | 175 | 2660 | 1809 | 256 |
| dormantWrites=100 | reactivate | angular | 1.04 ms [1.01 ms–1.64 ms] | 768 | 6198 | 0 | 1932 | 0 | 1809 | 256 |
| dormantWrites=100 | reactivate | preact | 701.0 µs [699.4 µs–704.4 µs] | 768 | 6184 | 0 | 1932 | 0 | 1809 | 256 |
| dormantWrites=10000 | deactivate | reflex | 85.9 µs [72.4 µs–121.8 µs] | 0 | 0 | 768 | 0 | 0 | 0 | 0 |
| dormantWrites=10000 | deactivate | angular | 461.2 µs [450.2 µs–549.4 µs] | 0 | 0 | 6198 | 0 | 0 | 0 | 0 |
| dormantWrites=10000 | deactivate | preact | 310.2 µs [255.1 µs–495.8 µs] | 0 | 0 | 6184 | 0 | 0 | 0 | 0 |
| dormantWrites=10000 | dormant-write | reflex | 269 ns [256 ns–282 ns] | 0 | 0 | 0 | 0 | 22.5 | 0 | 0 |
| dormantWrites=10000 | dormant-write | angular | 118 ns [114 ns–121 ns] | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| dormantWrites=10000 | dormant-write | preact | 90 ns [86 ns–105 ns] | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| dormantWrites=10000 | reactivate | reflex | 531.1 µs [489.9 µs–753.0 µs] | 768 | 768 | 0 | 173 | 2677 | 1817 | 256 |
| dormantWrites=10000 | reactivate | angular | 1.01 ms [928.1 µs–1.06 ms] | 768 | 6198 | 0 | 1817 | 0 | 1817 | 256 |
| dormantWrites=10000 | reactivate | preact | 646.5 µs [612.3 µs–661.8 µs] | 768 | 6184 | 0 | 1817 | 0 | 1817 | 256 |
