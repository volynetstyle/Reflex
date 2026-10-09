# Computed and watcher hot-path experiment

> All rows are production builds. Each point is the median of seven fresh
> processes with 150 ms minimum warmup and 500 ms minimum measurement.
> Runs are sequential rather than same-process paired measurements, so the
> repeated A/B bracket is the primary evidence and small deltas are treated
> as noise.

## Watcher specialization

The retained specialization has two parts:

1. fuse tracking epoch/context enter and restore into the existing tracking
   helpers and avoid an unconditional `payload = undefined` store;
2. represent cleanup ownership with `WatcherCleanupPending`, so the common
   no-cleanup watcher does not load `payload` and run `typeof` before every
   callback. Cleanup lifecycle becomes a pay-for-play branch.

| watchers | initial fused/base | cleanup B1 / fused A1 | cleanup B2 / fused A2 |
| ---: | ---: | ---: | ---: |
| 8 | 1.009x | 1.074x | 1.047x |
| 16 | 1.017x | 1.081x | 1.108x |
| 32 | 1.072x | 1.050x | 1.047x |
| 64 | 1.021x | 1.071x | 1.017x |

The cleanup ownership bit is positive in both A/B brackets at every width.
The repeated bracket shows +4.7%, +10.8%, +4.7%, and +1.7% for widths
8/16/32/64. The fused-context-only result is retained for its strictly smaller
production path, but its standalone wall-clock delta is not claimed because
the computed control showed comparable run-to-run drift.

## Computed experiment

The candidate replaced the imported comparator alias in `advance()` with a
direct `Object.is` call. It was rejected and reverted:

| scenario | direct Object.is / existing comparator | decision |
| --- | ---: | --- |
| equal-result | 0.981x | reject |
| changed-result | 0.968x | reject |

The existing comparator was 1.9% faster on equal-result and 3.2% faster on
changed-result in the nearest sequential control. No computed specialization
is retained: the true equal-result workload is already near Alien parity, and
the attempted change did not clear the noise threshold.
