# Retained allocation decomposition

Run from `packages/reflex-runtime`:

```sh
pnpm build:perf
node --expose-gc perf/node-allocation/run.mjs --count=30000 --trials=5
```

Each fixture runs in a fresh process and retains 30,000 nodes through full GC.
The callback is shared except in `consumer-closure`, where every node captures
its own index. Edge fixtures attach each consumer to 1, 4, or 16 shared
producers. `watcher-cleanup` runs a shared callback that returns a shared cleanup
function. `watcher-scheduled` sets the existing `Scheduled` state bit.

On Windows x64, Node 25.2.0, five trials on 2026-09-30, medians were:

| Fixture                   | Created B/node | Additional B/node | Additional B/edge |
| ------------------------- | -------------: | ----------------: | ----------------: |
| Producer                  |          96.68 |                 — |                 — |
| Consumer, shared callback |          96.74 |                 — |                 — |
| Consumer, unique closure  |         192.69 |                 — |                 — |
| Consumer, 1 edge          |          96.64 |             82.31 |             82.31 |
| Consumer, 4 edges         |          96.63 |            323.79 |             80.95 |
| Consumer, 16 edges        |          96.66 |           1283.23 |             80.20 |
| Watcher, shared callback  |          96.69 |                 — |                 — |
| Watcher, shared cleanup   |          96.73 |              1.05 |                 — |
| Watcher, scheduled bit    |          96.69 |              0.15 |                 — |

The small nonzero attachment values without edges are measurement noise. A
unique closure accounts for roughly 96 B/node in this fixture; each retained
edge accounts for roughly 80 B. The node's eight initialized fields occupy
roughly 97 B regardless of role when callbacks are shared. The low-level
runtime node has no owner metadata, and scheduling is a state bit, so this
fixture cannot assign a cost to host ownership. Creation timings from these
single allocation batches are exploratory and should not support a layout
change without an isolated paired timing and IC/deopt comparison.

There is no demonstrated 20–40 B/node cold extension to remove. Keep the
current node layout until a concrete cold field and mixed-role update profile
show a worthwhile gain.
