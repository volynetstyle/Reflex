# Effect fan-out attribution

> Scope: Reflex watcher fan-out through one shared derived value. Structural
> counters and wall-clock timings are separate experiments. Event counts are
> exact work attribution; they are not converted into invented percentages of
> CPU time. The internal timing probes use the Vite source build and must not
> be compared numerically with the production-build competitor results.

## Result

The medium-width gap is not caused by queue growth, extra flush passes, or
super-linear watcher work. The only structurally redundant term found was a
second delivery attempt to watchers that already owned a scheduler slot:

```text
before: schedule attempts = 2N - 1; successful = N; dedup = N - 1
after:  schedule attempts = N;     successful = N; dedup = 0
        owned-delivery skips = N - 1
```

The specialization preserves `Changed` evidence but skips the invalidation
hook when `Scheduled` already proves that the scheduler owns delivery. Queue
entries, watcher executions, frontier checks, and observable callbacks remain
exactly N per operation.

## Structural proof

| N | attempts before | dedup before | attempts after | owned skips after | enqueue/dequeue after | executions/frontier after | flush passes | queue grows |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 8 | 15 | 7 | 8 | 7 | 8/8 | 8/8 | 1 | 0 |
| 16 | 31 | 15 | 16 | 15 | 16/16 | 16/16 | 1 | 0 |
| 32 | 63 | 31 | 32 | 31 | 32/32 | 32/32 | 1 | 0 |
| 64 | 127 | 63 | 64 | 63 | 64/64 | 64/64 | 1 | 0 |
| 256 | 511 | 255 | 256 | 255 | 256/256 | 256/256 | 1 | 0 |

This rules out the ring-buffer capacity hypothesis for steady state: the queue
retains its backing storage after warm-up, and measured operations record zero
growths. Prewarming the queue to 1024 changes internal timings in both
directions, with no regime transition. Production `RuntimePhase` wrappers are
also not on this path; they are development-only.

## Production-build crossover after specialization

Each framework/scenario/size/trial ran in a fresh Node process. The ratio is
the median paired Alien/Reflex throughput ratio. Positive excess means Reflex
spent more nanoseconds per operation; dividing by N exposes the remaining
per-watcher term.

| watchers | Alien / Reflex | Reflex ns/op | Alien ns/op | Reflex excess ns/watcher |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 0.960x | 55.30 | 55.51 | -0.21 |
| 2 | 1.016x | 83.16 | 80.89 | 1.14 |
| 4 | 1.047x | 136.50 | 132.68 | 0.95 |
| 8 | 1.267x | 271.57 | 211.08 | 7.56 |
| 16 | 1.244x | 468.44 | 377.16 | 5.70 |
| 32 | 1.236x | 908.48 | 723.01 | 5.80 |
| 64 | 1.224x | 1744.29 | 1416.56 | 5.12 |
| 128 | 1.170x | 4205.14 | 3364.56 | 6.57 |
| 256 | 0.980x | 7671.10 | 8065.52 | -1.54 |
| 512 | 0.920x | 14305.19 | 14956.02 | -1.27 |
| 1024 | 0.948x | 30504.12 | 32101.30 | -1.56 |

At 8-64 watchers the remaining gap is approximately 5-8 ns per watcher. It
does not grow with N and is near zero by 512-1024. This is a relative-cost
hump from a small per-watcher tax, not evidence of a worse fan-out coefficient.
The before/after production runs were separate, so their wall-clock deltas are
not claimed as a paired speedup; the exact win is the removed structural work.

## Body-cost amortization

The benchmark holds fan-out at 32 and increases callback work. The gap falls
from roughly 18-22% for tiny bodies to 0-5% for meaningful bodies. The
body=16 point is a non-monotonic JIT threshold and should not be read as an
algorithmic transition.

| synthetic body iterations | Alien / Reflex |
| ---: | ---: |
| 1 | 1.178x |
| 4 | 1.179x |
| 16 | 1.220x |
| 64 | 1.045x |
| 256 | 0.997x |
| 1024 | 1.003x |

## Internal pipeline probes

These numbers are source-build diagnostic timings in ns per watcher. They are
useful only as cumulative attribution inside this run. `scheduler-bypass` runs
the known watcher array directly and deliberately lacks queue ownership, dedup,
failure, and reentrancy guarantees; it is a lower-bound diagnostic, never a
competitor result.

| N | claim-release | queue-roundtrip | empty-wrapper | direct-source | scheduler-bypass | shared-derived |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 8 | 240.8 | 481.2 | 1066.6 | 1969.8 | 1990.1 | 2712.1 |
| 16 | 244.2 | 455.2 | 1038.9 | 1843.1 | 1810.4 | 2482.6 |
| 32 | 239.2 | 430.4 | 1018.9 | 1764.6 | 1722.5 | 2371.5 |
| 64 | 244.1 | 422.6 | 1002.2 | 1720.6 | 1664.1 | 2319.2 |

The full shared-derived path exceeds direct execution without scheduler
semantics by about 649-722 source-build ns per watcher across N=8-64. That
difference bounds the scheduling protocol cost, but does not prove it is all
removable: the bypass omits guarantees that Reflex intentionally provides.
One watcher flushed N times costs about 2.3-2.9x more per callback than N
watchers in one flush, so batching amortizes rather than creates the hump.
Shared versus distinct callback identities differ by about 0.8%, which rejects
callback polymorphism as the primary explanation in this workload.

## Interpretation and next target

Proven and implemented:

- `Scheduled` is a scheduler-ownership certificate for an already queued
  watcher. Re-delivering the same invalidation hook cannot add observable work.
- The specialization removes N-1 scheduler claims/dedup checks while retaining
  the state transition and all side fan-out.
- Validation-error recovery preserves `Scheduled`: queue ownership survives a
  failed reentrant validation and the retry is deferred to the next drain.
- `WatcherCleanupPending` makes cleanup lifecycle pay-for-play: the normal
  watcher avoids a payload load, `typeof`, and redundant undefined store.
- Targeted reentrant and side-invalidation tests pass, as do the complete
  runtime and scheduler suites.

Not proven removable:

- the one required claim/release, enqueue/dequeue, frontier validation, tracking
  context enter/restore, cleanup check, and callback wrapper per watcher;
- bookkeeping required by Reflex's stronger reentrant scheduling semantics.

The no-cleanup specialization is now implemented. Any next watcher change
must isolate the remaining tracking/frontier/reentrancy term with an adversarial
differential suite rather than removing the scheduler or frontier wholesale.
Queue redesign, bitmap queues, and V3 frontier certificates are not justified
by these measurements.

## Reproduction

```sh
pnpm --filter @volynets/reflex bench:effect-fanout
pnpm --filter @volynets/reflex bench:effect-fanout:analyze
```

External artifacts used by this report:

- `bench-results/reflex-competitors/fanout-crossover.csv` (pre-specialization)
- `bench-results/reflex-competitors/effect-fanout-scheduled-ownership.csv`
- `bench-results/reflex-competitors/effect-fanout-body-cost.csv`
