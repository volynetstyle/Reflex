# Liveness comparison: Reflex vs Angular vs Preact

Tests whether a persistent bidirectional graph (Reflex) costs more or less
than live/non-live subscription management with global-version polling
(Angular `primitives/signals`, Preact signals-core) **under an identical
lifetime contract**: every computed handle is held for the whole run and
effects are disposed explicitly. No workload relies on GC collecting
unreachable computeds; that is a real advantage of reverse-link-free
designs for raw APIs, but a different question.

Pinned: `@angular/core` 22.2.0, `@preact/signals-core` 1.14.4; Reflex is the
working-tree production facade (`dist/`).

```powershell
pnpm --filter @volynets/reflex bench:liveness            # 5 trials
node bench/liveness/run.mjs --trials 1 --skip-structural # quick timing
```

Output: `bench-results/liveness/{report.md,timing.json,structural.json}`.
Conclusions: `packages/reflex-runtime/docs/performance/lifetime-liveness.md`.

## Workloads (`workloads.mjs`)

Shared DAG: 64 producers, 4 × 512 computeds (fan-in 3), 256 watchers reading
3 top-layer nodes each, 64 unrelated signals nobody reads.

| workload | question | params |
|---|---|---|
| `observer-toggle` | Does detaching/re-attaching amortize when observers churn and writes are rare? | share of watchers toggled, writes per cycle |
| `standalone-reads` | What do global version/epoch checks cost on direct reads after unrelated writes? | reads per unrelated write (0 = none) |
| `dormant-writes` | Liveness' best case: one deactivation, many writes, one reactivation | writes while dormant |

## Measurement

- **Timing** (`worker.mjs`): unmodified production builds, one fresh process
  per (framework, workload, param, trial), framework order rotated, warm-up
  instance on another seed, median and range over trials.
- **Structure** (`structural.test.mjs`, vitest): Reflex from source with
  `__PROFILE__` counters plus injected link/unlink counters; Angular and
  Preact from copies of their builds with counters injected at fixed sites.
  Every injection must match an exact number of occurrences, so a version
  change fails instead of silently miscounting.
- **Correctness**: every run verifies all top-layer values against a plain-JS
  reference; the structural pass also requires identical observed sums across
  frameworks.

Uniform counters: `linkAlloc` (dependency link objects), `subscribe` /
`unsubscribe` (subscriber-list insertions/removals; every Reflex edge is a
subscriber-list member), `pollVisits` (dependency links inspected for
freshness; Reflex pull/frontier edges), `notifyVisits` (subscriber links
visited by propagation), plus user-level `computes` and `effectRuns`.
