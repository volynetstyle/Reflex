# Alien Signals vs Reflex reactivity benchmark

This package implements the 35 workloads from Vue core PR #12349 at commit
`cab5ecfdc2395ae88934a9af87cbe548ae84ea0a`, corrected variants, structural
diagnostics, and lifecycle regression contracts.

## Suites

- `vue-12349-exact`: 13 computed, 18 effect, and 4 ref cases with literal
  source semantics. This intentionally preserves the lazy uninitialized
  computed cases, O(N²) unbatched mutation case, and the mislabeled case that
  creates 1001 effects.
- `vue-12349-corrected`: initialized computed graphs, a true single-effect
  case, and explicit eager/batched mutation variants.
- `diagnostic`: `wide-shared-sink` at depths 1/4/16 with shared and per-branch
  effects, plus `rotating-dependencies`. The default width matrix is
  10/100/1000/4096 and both eager/batch policies are run.

Every `(framework, workload, size, policy)` is executed in a fresh Node
process. Headline measurements import unchanged production packages and run
with JIT unless `--jitless` is explicitly supplied. Reports include mean,
p95/p99, ops/s, heap/RSS, GC observations, observable work counters, checksum,
and cross-framework equivalence failures.

```powershell
pnpm --filter @reflex-lab/reactivity-bench build
pnpm --filter @reflex-lab/reactivity-bench bench -- --output results/full.json
pnpm --filter @reflex-lab/reactivity-bench bench -- --suite diagnostic --case rotating-dependencies
pnpm --filter @reflex-lab/reactivity-bench bench:instrumented
pnpm --filter @reflex-lab/reactivity-bench contracts
```

Useful runner filters are `--suite`, `--framework`, `--case`, `--size`,
`--policy`, `--warmup`, `--iterations`, `--samples`, `--output`, and
`--jitless`. Comma-separated values are accepted.

## Instrumentation boundary

Headline throughput never uses instrumented code. `bench:instrumented` builds
a separate Reflex source bundle with `__PROFILE__` enabled and creates a local
instrumented copy of Alien 3.2.1. Alien reports links created/reused/unlinked
and traversal stack-frame allocations. Reflex reports its native tracking,
cleanup, push/pull counters and flat-worklist topology (`maxStack` included).

The Alien lifecycle tests are marked `it.fails`: they document the three known
3.2.1 regressions and fail if the regression unexpectedly disappears. Reflex
passes the two equivalent public contracts. The failed-scope contract is
explicitly skipped for Reflex because Reflex has no public `effectScope()` API;
pretending model ownership is the same contract would be misleading.

Memory deltas are noisy and can be negative after GC; use repeated runs and GC
counts alongside the instrumented mechanism report. Treat the one-sample smoke
mode only as wiring validation, never as a performance result.
