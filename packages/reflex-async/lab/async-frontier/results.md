# Async frontier benchmark results

Run: 5 isolated rounds × 9 samples per variant, Windows x64, Node v25.2.0,
12th Gen Intel Core i5-1235U. The raw report is written to the ignored
`.cache/async-frontier/report.json`; rerun with `npm run bench:async:frontier`.
Times are median nanoseconds per operation. Lower is better.
This rerun uses pure materialization and attempt-local vector caching. Benchmark
SHA-256: `4e0b150a3dee76f37353a4ac97d71d6f052f2e9e29904cff9012f762bba656bb`.

## Capture

| Workload                            |       Set | Flat array | DAG + Set | DAG + epoch | DAG + cached flat |
| ----------------------------------- | --------: | ---------: | --------: | ----------: | ----------------: |
| Chain, depth 16                     |     4,136 |      1,793 |     1,350 |   **1,322** |             1,339 |
| Chain, depth 64                     |    61,319 |     29,555 |     6,217 |       6,983 |         **5,890** |
| Chain, depth 256                    | 1,013,641 |  1,168,188 |    20,606 |      23,841 |        **20,412** |
| Diamond, depth 16                   |    25,393 |     10,766 | **5,189** |       5,329 |             5,272 |
| Attempt over cached chain, depth 64 |     2,150 |  **1,174** |     1,980 |       1,988 |             1,998 |
| Cached child read 64×               |       577 |        416 |   **400** |         416 |               402 |
| 90% frontier drop                   |       244 |    **124** |       302 |         357 |               294 |

For cached evaluation composition, the shared proof graph scales far better than
eager union: DAG + cached flat takes 5.9 μs at chain depth 64 and 20.4 μs at
depth 256, versus 61.3 μs and 1,014 μs for Set. Small differences between the
DAG variants vary between runs; the epoch prototype also changes reentrant behavior.
Attempt capture over an already-cached depth-64 graph includes the owner-cycle
check; that one composition is roughly 2.0 μs for DAG + cached flat and 2.2 μs
for Set. The largest savings come from composing many cached evaluations, not
from a single final merge.

## Publication

| Workload                                  | Set | Flat array | DAG + Set | DAG + epoch | DAG + cached flat |
| ----------------------------------------- | --: | ---------: | --------: | ----------: | ----------------: |
| Cold publication, 1 validation, chain 64  | 266 |    **120** |     3,773 |       1,898 |             5,054 |
| Cold publication, 4 validations, chain 64 | 766 |    **436** |    14,463 |       6,991 |             4,884 |
| Warm publication, chain 64                | 179 |    **108** |     2,725 |       1,656 |               139 |
| Warm publication, diamond 16              |  87 |     **49** |     1,915 |       1,359 |                72 |
| Warm publication, fan-in 64               | 169 |    **107** |     1,445 |         423 |           **107** |
| Warm blocked retry, 4×                    | 184 |    **107** |     1,776 |         782 |               109 |

The cold case includes first materialization and validation. Its four-validation
case gives the flat vector one cold materialization followed by three warm
passes. Warm publication and blocked retries reuse the attempt's cached vector;
the DAG + cached flat result stays near the flat-array path and avoids repeated
graph walks or epoch state. Cold materialization is a real cost: for one chain
validation, DAG + cached flat is slower than the other variants. Its value
depends on the capture-to-publication ratio and on retries.

Post-GC retained-heap estimate, averaged per retained frontier:

| Shape             |     Set | Flat array | DAG + Set | DAG + epoch | DAG + cached flat |
| ----------------- | ------: | ---------: | --------: | ----------: | ----------------: |
| Chain, depth 64   | 1,646 B |      463 B | **258 B** |   **258 B** |         **258 B** |
| Diamond, depth 64 | 3,014 B |      669 B |     210 B |       210 B |             210 B |

These are live-heap deltas for 24 retained graphs after warmup and two explicit
GCs, not allocation totals. Treat them as directional estimates; object layout
and V8 heap behavior affect the values. Cold publication ranges are wide, so
small differences between DAG variants should not be treated as significant.

All five variants produced the same dependency union. Set, flat, DAG + Set and
DAG + cached flat made 4 calls in the overlapping nested-validation case. DAG +
epoch made 5 because the inner walk overwrote its marker and the outer walk
revisited a dependency. The production implementation uses the cached flat
publication vector, not mutable dependency epochs.

## Production shape

Evaluation and capture retain an ordered, structurally shared proof graph. A live
attempt materializes its distinct read-only publication vector after the
freshness checkpoint and caches it for validation and retries. Freshness pulls
before that point can walk the graph without retaining a flat vector. Terminal
publication releases the graph and keeps the vector for later pulls. This
separates the work by lifecycle phase instead of making one collection optimize
both.

`materializeFrontier` has no global cache. An attempt owns its memoized vector;
the source retains that vector for committed freshness pulls. Independent
attempts materialize independently. The owner-cycle check still traverses the
inherited graph during capture.

This is still a data-structure microbenchmark. It excludes the Reflex scheduler,
watcher lifecycle and async-source orchestration; production correctness and
mutation qualification are separate checks.

See [the production consumption benchmark](./consumption-results.md) for runtime
timings, repeated pending pulls, cross-attempt reuse and owner-check experiments.
Those measurements expose costs that this isolated comparison does not include.
