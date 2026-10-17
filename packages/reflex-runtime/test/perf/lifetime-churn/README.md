# Lifetime experiments (A / B / C)

Long-running workloads that separate what an ownership lifecycle solves from
what would have to be solved in the graph itself. No runtime source is
changed; the harness reads existing node/edge fields and the `__PROFILE__`
counters.

## Reproduce

```powershell
pnpm --filter @volynets/reflex-runtime bench:lifetime-churn
```

Output: `bench-results/lifetime-churn/latest.json` and `report.md`.

Knobs (environment): `LIFETIME_ONLY=A,B,C`, `LIFETIME_CYCLES` (10000),
`LIFETIME_WINDOW` (200), `LIFETIME_CHECKPOINTS` (20), `LIFETIME_PROBE_WRITES`
(32), `LIFETIME_DAG_WATCHERS` (4096).

## Workloads

**A / B: create/dispose churn** (`churn.ts`). Four producers, two shared
computeds (`sharedSum`, `sharedScaled`) and an app watcher that keeps them
clean. Each component has a local producer, `c1 = sharedScaled + local`,
`c2 = c1 + s3 + sharedSum` and an effect reading `c2` (4 nodes, 6 edges).
Every cycle mounts one component, unmounts the oldest beyond `window`, writes
`s0` and flushes. Variants differ only in unmount:

| variant | unmount |
|---|---|
| A `managed` | `disposeOwnershipNode` over reflex-framework `useSignal`/`useComputed`/`useEffect` |
| control `raw-manual-dispose` | `disposeWatcher` + `disposeNode` on both computeds by hand |
| B `raw-dispose-watcher` | effect disposed, computeds dropped (what `computed()` offers) |
| B `raw-no-dispose` | nothing disposed (shorter: effects keep running, cost is quadratic) |

**C: shared dependencies** (`dag.ts`). 64 producers, 4 layers × 512
computeds (fan-in 3), 4096 watchers reading 3 nodes each; watchers are removed
in 32 seeded steps. `retain` disposes only watchers (exactly what a lifecycle
gives when the DAG belongs to a long-lived owner). `oracle-prune` additionally
disposes every computed no live watcher can reach: the lower bound for any
graph-level unobserved-detachment scheme, not a proposed algorithm.

**D: deactivate → W writes → reactivate** (`reactivation.ts`). Two regions of
4 × 128 computeds; A is always observed, B loses all watchers and later gets
new ones over the same handles. 16 shared producers feed both regions, 48
foreign producers feed only A. W ∈ {0, 1, 10, 100, 1000}, writes go to shared
or foreign producers. Variants: `retain`, `suspend-conservative` (unlink, mark
Changed), `suspend-oracle` (relink saved edges, recompute only nodes whose
producers were written: perfect freshness check), `dispose-recreate`. Every
reactivation is checked against a plain-JS reference evaluation, and region
edge counts must be stable across cycles; the sweep fails otherwise. Output:
`reactivation.{json,md}`.

Conclusions: `docs/performance/lifetime-liveness.md`.

## Metrics

- **heap**: `heapUsed` after forced GC, relative to a baseline taken after a
  warm-up probe. C reports peak = max post-GC heap.
- **retained/released**: WeakRefs to objects of unmounted owners still alive
  after GC.
- **graph census**: walk from the producers through both edge directions.
  `dead` = nodes of unmounted components still linked (A/B); `unobserved` =
  computeds no live watcher reaches (C). Dead/unobserved edges = edges whose
  subscriber is dead.
- **write probe**: `LIFETIME_PROBE_WRITES` × (write + flush). Structural
  counters (`pushDirectEdgesVisited + pushTransitiveEdgesVisited`,
  `pushAlreadyDirtySkipped`, `pullEdgesVisited`, `advanceComputeRuns`,
  `watcherExecutions`) come from one pass; wall time from a second pass with
  counters disabled. Timing is from the profile build, so compare it only
  across rows, never with production numbers.

Harness notes: raw closures are created in separate factories, because
closures from one function share a V8 context and a retained `c1` would
otherwise keep a disposed effect alive. Component nodes created inside
framework hooks are identified through the `currentConsumer` register during
their first run.
