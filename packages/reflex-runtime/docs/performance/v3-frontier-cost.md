# V3: the cost of the full validation frontier

V3 is a guarantee: before the cleanup and the watcher callback run, the
runtime validates **the whole committed dependency frontier**. It is not an
eager-effect variant and not a general scheduler cost: V3 lives in
`pull_frontier()`.

This document separates proven costs, architectural consequences and
hypotheses. It does not turn a count of profile events into a "CPU
percentage": that conclusion needs a separate calibration of the cost of each
event.

## Cost model

```text
write / push invalidation
          |
          v
watcher Unknown
          |
          v
pull_frontier (V3): the whole root frontier
  clean root        -> one shallow state check
  Changed root      -> advance
  Unknown subtree   -> should_recompute / deep pull
          |
          v
only then cleanup and the watcher callback
```

The strict bound of V3 is `O(D + dirty slice)`, where `D` is the number of the
watcher's committed root dependencies. A dirty dependency that needs deep
validation adds its pull traversal. An early confirmed change does **not**
allow the walk to stop: a later dependency may throw, and the lifecycle is
irreversible once started. This is checked by the V3 contract and the
independent spec runtime.

The profile counters `watcherFrontierEdgesVisited` and
`watcherFrontier{Changed,Invalid,Clean}Deps` isolate exactly this region. The
test `watcher-frontier.projection.test.ts` pins the key invariant: with the
first of 128 roots changed, the walk still visits 128 root edges (1 changed,
127 clean).

## What the semantic decomposition achieved

| Component            | Observation                                                                                                                                                                               | Conclusion                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| V3 root frontier     | For a clean root, `pull_frontier` runs a fused shallow loop, does not enter the generic deep walker and makes no call per clean edge.                                                     | The semantic guarantee is isolated: it costs a predictable linear scan, not a branch on the push hot path.              |
| Clean path           | In an external comparative probe the clean edge was nearly at parity with Alien (a gap of about 6.5%).                                                                                    | The decomposition added no noticeable common-path tax. This is an external signal, not proof of a cost share.           |
| Stable tracking      | In the `locality` sweep at width=128 all modes lie within 421-432 µs/op; the dominant bucket is `trackingFast`, and reconciliation does not appear.                                       | The cursor/next fast path keeps a stable dependency set local even under permutation and duplicate reads.               |
| Equality shielding   | In `semantic`, as the semantic-change ratio grows from 0 to 1, generic `pull` falls from 255 to 1 events/op: confirmed changes do not force a repeated deep validation of a known result. | Separating Changed from Unknown cuts pull work where there is confirmed evidence. It moves that work into push, though. |
| Reentrancy ownership | V3 uses `Computing + tailIn` and the existing push protocol for epoch-local invalidation.                                                                                                 | The reentrancy guarantee does not spread extra state or branches over the ordinary propagation path.                    |

## Where cost remains and specialization is needed

| Priority | Component                          | Data from `bench-results/cost-attribution/REPORT.md`                                                                                                                                                                                 | Next narrow step                                                                                                                                                                                                  |
| -------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | High fan-out / push                | Before specialization: `6143 = 2048 direct + 2048 transitive + 2047 push-once`. After passing the stable committed edge as an owned continuation: `4096 = 2048 direct + 2048 transitive`, `push-once=0`, `owned-edge elisions=2048`. | The structural duplication is gone. The new timing leg gives 9.83 ms/op at fanout=2048, but the old 26.39 ms/op is not a paired A/B; the exact throughput gain still needs an alternating baseline/candidate run. |
| P1       | `advance()` / equal-result path    | A recompute without downstream propagation separates enter/compute/restore/cleanup-check/compare/state-commit from fan-out.                                                                                                          | Add a paired changed-vs-equal probe with the same topology and the `advance*`, tracking and cleanup counters. Only then compress this path.                                                                       |
| P2       | Large fan-in / dependency width    | fanin=2048: trackingFast 2,048 events/op, 6.89 ms/op; width=2048: 2,048, 7.17 ms/op.                                                                                                                                                 | Specialize the stable wide read set: data layout, edge iteration and bulk cursor reuse. There is no evidence of algorithmic duplication here; it is a mechanical task.                                            |
| P3       | Wide watcher frontier (cost of V3) | The `O(D)` root scan is semantically unavoidable. The earlier `pull-wide` timing probe gives a contradictory head-change result, so it cannot be used as evidence of a speedup.                                                      | Collect timing together with the new V3 counters and check `frontierEdgesVisited == D` for clean/head/tail/equality. Compare only identical walks.                                                                |
| P4       | Deep dirty path                    | depth=512: advance 1,024 events/op, pull 1,021, 4.82 ms/op.                                                                                                                                                                          | Investigate the roughly `2D`, but after high fan-out: depth is not currently the worst customer-shaped path.                                                                                                      |
| P5       | Dynamic dependency maintenance     | `churn` at width=128: trackingFast ~128, reconcile grows 0 -> 22.39 events/op. Timing around 0.83-0.92 ms/op and noisy.                                                                                                              | Do not optimize blind: add allocation/reuse, detach, edge-move and cache-miss counters; then extract the common churn shape from the competitor `dynamic-branch`, `reorder` and `window-churn` workloads.         |
| P5       | Stack capacity                     | Pull trimming starts around depth=259, push trimming around fanout=513. The fine sweep shows no stable timing cliff exactly at the onset.                                                                                            | This is hygiene, not a primary bottleneck: measure retained capacity and GC before changing thresholds.                                                                                                           |

## Practical decision

1. Treat V3 as a successful semantic decomposition on the common path: it
   makes the obligation explicit and keeps it in `pull_frontier` instead of
   paying for it on every push operation.
2. Do not promise "V3 is faster" from one aggregate benchmark. V3 buys a
   correct exhaustive validation; its base cost is proportional to the width
   of the committed watcher frontier and must not be hidden by an early exit.
3. Repeated push delivery into a shared root is removed by the rule **an
   active continuation owns its stable committed edge**. The next P0 is to
   confirm the gain with a paired A/B and to check whether the remaining
   transitive already-dirty visits can be cut safely. After that come the
   **equal-result advance path** and the **wide read-set layout**. The V3
   frontier and the deep walker remain research directions; churn needs more
   instrumented evidence.

## Reproducibility

```sh
pnpm --filter @volynets/reflex-runtime test:projection
pnpm --filter @volynets/reflex-runtime bench:cost-attribution
pnpm --filter @volynets/reflex-runtime bench:pull-wide
```

`bench:pull-wide` is currently a diagnostic timing probe. Its result becomes
an input to a decision only together with a profile run that confirms how many
V3 root edges were actually visited.
