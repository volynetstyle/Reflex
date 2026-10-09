# Priority findings

Environment: Node 25.2.0 / V8 14.1.146.11-node.13 on Windows x64. Headline
ratios are medians of same-trial throughput ratios across five fresh-process
trials. Every row below completed 5/5 trials with matching per-operation work
counters.

## Equal write is not equal result

| path | Reflex ops/s | Alien ops/s | Alien / Reflex | computed/op | effects/op |
| --- | ---: | ---: | ---: | ---: | ---: |
| same write + batch/flush (`equal-leaf`) | 104,079,142 | 179,017,671 | 1.712x | 0 | 0 |
| same write, direct | 405,120,020 | 464,756,980 | 1.112x | 0 | 0 |
| changed write, equal computed result | 20,797,382 | 21,459,129 | 1.026x | 1 | 0 |
| changed computed result | 16,580,323 | 17,445,636 | 1.085x | 1 | 1 |

The former 1.74x P0 was misclassified: it belongs to a same-value write plus
the public transaction/settle boundary, not to `advance()`'s equal-result
path. Removing that boundary reduces the same-write gap from 1.71x to 1.11x.
The true equal-result path is within 2.6% of Alien in the paired result.

The internal structural probe records exactly one changed write, direct edge
visit, compute, equal commit, and stable dependency-edge reuse per equal-result
operation. It records no pull, cleanup, downstream propagation, or watcher
work. Equal-result and changed-result have identical structural work through
compute/reuse; only the equal versus changed commit differs.

## Effect fan-out: narrow-width hump

| observers | Alien / Reflex throughput |
| ---: | ---: |
| 1 | 1.048x |
| 2 | 1.142x |
| 4 | 1.194x |
| 8 | 1.324x |
| 16 | 1.315x |
| 32 | 1.342x |
| 64 | 1.352x |
| 128 | 1.166x |
| 256 | 0.998x |
| 512 | 1.100x |
| 1024 | 1.031x |

The actionable deficit is a hump at roughly 8-64 observers, peaking at 1.35x,
not an asymptotic fan-out failure. By 256 and 1024 observers the runtimes are
effectively at parity; the 512 point is non-monotonic and should not be used
alone as evidence for a new regime.

## Independent fan-out crossover

`wide-fanout` performs one recomputation and one observer execution per leaf.
Alien is slightly ahead through width 32; Reflex takes the lead at width 64
and remains ahead through 1024 in this sweep.

| leaves | Alien / Reflex throughput |
| ---: | ---: |
| 1 | 1.090x |
| 2 | 1.085x |
| 4 | 1.037x |
| 8 | 1.094x |
| 16 | 1.014x |
| 32 | 1.083x |
| 64 | 0.977x |
| 128 | 0.911x |
| 256 | 0.925x |
| 512 | 0.851x |
| 1024 | 0.946x |

## Revised order

1. P0: effect fan-out at 8-64 observers; decompose scheduler queue boundaries,
   watcher invalidation, and watcher execution.
2. P0.5: same-write transaction/settle overhead only if this boundary is common
   enough to justify optimizing a roughly 4 ns absolute delta. The raw equality
   path itself is not a large target.
3. P1: wide read-set/dependency layout.
4. P1 evidence: retain the dense fan-out sweep as crossover proof, not as an
   optimization target.
5. P2: deep path, churn after allocation/reuse/detach counters, and V3
   frontier certificates.

Raw evidence:

- `semantic-outcome-p0.json`
- `equal-write-boundary-p0.json`
- `fanout-crossover.json`
- `../cost-attribution/structural/semanticOutcome.json`
- `../cost-attribution/timing/semanticOutcome.json`
