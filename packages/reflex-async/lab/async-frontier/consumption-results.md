# Frontier ownership and production consumption

Run: 3 isolated rounds × 7 samples, Windows x64, Node v25.2.0,
12th Gen Intel Core i5-1235U. Times below are median microseconds per operation.
Raw samples, ranges, source hashes and bundle hashes are in
`.cache/async-frontier/consumption-report.json`.

The previous production bundle was preserved before this change. It uses a
global WeakMap in addition to the Attempt cache, structural `kind` detection,
and exact frontier membership comparison for optional profiling. The current
bundle uses pure materialization, an Attempt-owned publication vector, a private
symbol brand, and conservative local shape comparison. Profiling is disabled
in these workloads.

Bundle SHA-256:

- Previous: `0e90eb958b0e77b309225db0b30856f8b1f6205581df2090cf1e8c64f2ae4e86`.
- Current: `d0cfa17fea377f2128c0e192a7979a0a31a64823067ba92825bd4ceccb2aa3ef`.

Both lifecycle builds include the same semantics-lab publication observer, with
no active validation hooks. This is a before/after comparison of the complete
frontier change, not an isolated estimate of WeakMap lookup cost. The benchmark
alternates build order and uses identical iteration counts. Primitive probes
use the actual, uninstrumented frontier and Attempt implementation.

## End-to-end lifecycle

| Workload                                            | Previous | Current |
| --------------------------------------------------- | -------: | ------: |
| Sync derived chain, depth 16                        |    0.409 |   0.408 |
| Async sync-result chain, depth 8                    |    9.381 |   9.889 |
| Async Promise chain, depth 8                        |  285.266 | 275.725 |
| Cached sync bridge, depth 64: capture + publication |    8.384 |  11.635 |
| Diamond: invalidation + publication                 |    3.082 |   2.916 |
| Dynamic branch: invalidation + publication          |    1.130 |   1.200 |
| Blocked candidate: publication retry                |   23.530 |  24.148 |
| Supersession: two pending refreshes + drain         |   32.167 |  30.610 |
| Pending attempt: 0 additional pulls, depth 64       |   23.738 |  25.886 |
| Pending attempt: 1 additional pull, depth 64        |   31.080 |  35.405 |
| Pending attempt: 4 additional pulls, depth 64       |   47.125 |  51.917 |
| Pending attempt: 16 additional pulls, depth 64      |  106.868 | 112.135 |

The cached bridge reuses the identical proof graph across attempts. Removing
cross-attempt materialization reuse costs about 3.25 μs here, a 39% increase
in the median. The previous range is 7.70–12.01 μs; the current range is
11.15–23.82 μs. Most other differences are small relative to their overlapping
sample ranges and should not be presented as demonstrated speedups.

Each pending operation refreshes the target, performs the requested number of
explicit `read()` calls while its promise is unresolved, then settles that
promise and awaits a verified fresh result. Refresh and resolve include their
ordinary freshness checkpoints. Pending `read()` calls must throw a blocker.
The 0-pull control includes all lifecycle overhead other than the extra reads.
The blocked-candidate workload captures a warmed bridge untracked, retaining
its proof obligations without a reactive rerun edge; it verifies that the
candidate stays pending until its root settles.

## Repeated prepublication consumption

These probes call the actual frontier functions over a depth-64 proof with
64 distinct handles. Each handle increments an ensure counter, checked after
every timed batch. The adaptive alternative walks on the first pull, materializes
on the second, and iterates that local vector thereafter. It is not installed
in production.

| Pulls per pending frontier | Walk every time | Vector from second pull |
| -------------------------- | --------------: | ----------------------: |
| 1                          |           3.262 |                   3.456 |
| 4                          |          13.158 |                   7.262 |
| 16                         |          52.881 |                   8.139 |

Repeated graph walks are a measurable cost. An adaptive policy is promising for
frequently pulled pending attempts, but also materializes attempts that may later
be superseded. These pure-probe timings do not establish its complete lifecycle
behavior or retained-memory cost. Production retains the existing lazy policy.

## Independent attempts over one cached proof

Each operation creates 1/2/8/64 independent Attempt objects over the same
depth-64 proof root. The simulated global WeakMap is warmed before timed samples
and remains alive across operations; the first global materialization is excluded.
Every Attempt-local path performs its own cold materialization. Both paths
include Attempt and AbortController construction. Results are per whole group,
not per attempt.

| Attempts per group | Attempt-local vector | Warm shared WeakMap vector |
| ------------------ | -------------------: | -------------------------: |
| 1                  |                3.517 |                      0.116 |
| 2                  |                7.066 |                      0.190 |
| 8                  |               28.180 |                      0.627 |
| 64                 |              224.468 |                      5.306 |

Cross-attempt reuse is valuable in this deliberately shared topology, consistent
with the cached-bridge runtime result. Attempt ownership removes hidden global
state, but does not make cold materialization faster by itself. If sharing is
added later, these results support measuring an explicit cache owned by an
evaluation generation. This probe does not justify a cache for all frontiers.

## Owner-cycle experiment

The timed owner is absent from the depth-64 inherited graph. A separate hidden
owner probe verifies rejection and whether user capture can continue past the
merge. No alternative changes production code.

| Policy                                          | Capture | Capture + cold publication | Rejects hidden owner before capture continues |
| ----------------------------------------------- | ------: | -------------------------: | --------------------------------------------- |
| A: current graph traversal                      |   2.167 |                      5.755 | Yes                                           |
| B: deferred check in materialized vector        |   0.065 |                      4.198 | No                                            |
| C: membership in an already-materialized vector |   0.086 |                      4.023 | Yes                                           |

C excludes creation of its membership vector from timing and uses linear
`includes`; it does not make uncached membership free or constant-time.
Publication in every row still performs pure materialization for the new attempt.
B rejects the same hidden owner at a later phase, after capture continuation.
It fails the capture-time protocol criterion and is not promoted. This dedicated
probe is not a complete B3 qualification of either experimental implementation.
Production keeps A, qualified by the ordinary tests, B3 corpus and mutation suites.

## Verification

- TypeScript async tests project passes.
- 92 targeted async/frontier/evaluation/qualification tests pass.
- B3 production corpus: 84/84 cases. Direct/cached exploration completes at
  1,129 states and 2,054 transitions per scheduler; pending capture completes at
  41 states and 57 transitions. All nine capture/scheduler combinations pass.
- All 13 ordinary async mutants and all 9 production B3 mutants are killed.
  New mutants cover branding, capture order, distinct leaves, false-positive
  shape comparison, lost retry memoization and skipped inherited owner detection.
- Full package suite: 385/388 pass. The same three upstream `#211` gates fail
  with `Upstream operation called outside framework.run()` in flush/sab/eager;
  that test file is unchanged by this work.

Run from `packages/reflex-async` with `pnpm bench:async:consumption`. See
[the README](./README.md) for baseline capture and sampling instructions.
