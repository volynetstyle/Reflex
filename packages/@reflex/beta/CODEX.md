# Codex Instructions For `@reflex/beta`

This file describes how Codex/GPT should reason about changes in `@reflex/beta`.

## Primary Objective

Preserve the current runtime model:

- lazy pull on read
- cheap push invalidation on write
- SAC through `changedAt / computedAt`
- dynamic dependency cleanup through edge tracking

Do not replace this architecture casually.

## Change Priorities

When proposing or implementing changes, optimize in this order:

1. correctness of reactive invariants
2. simplicity of the core model
3. hot-path cost on real benchmarks
4. memory footprint and GC pressure
5. extensibility for optional eager/flush modes

## Non-Negotiable Invariants

Codex should preserve these rules unless explicitly asked to redesign the runtime:

- `write` must not recompute the graph
- `changedAt` changes only when value actually changes
- `computedAt` changes on every successful recompute
- `Invalid` is a hint, not proof of stale value
- `Tracking` is about dependency-set stability, not freshness
- dynamic dependency cleanup must happen after recompute, not during graph reads

## Benchmark Guidance

When evaluating performance:

- benchmark built runtime when the benchmark is intended to measure package output
- avoid changing both benchmark methodology and runtime logic in one step unless necessary
- treat high fan-in final reads as a known weak spot of lazy pull
- prefer real benchmark evidence over theoretical asymptotics

If a change improves worst-case complexity but loses common-case benchmark performance, prefer the simpler common-case win unless the workload explicitly targets the worst case.

## How To Approach Runtime Changes

For `engine.ts`:

- keep `ensureFresh()` simple
- prefer small constant-factor wins over clever multi-phase traversals
- avoid extra allocations in hot paths
- prefer shared execution helpers over duplicating computed/effect pipelines

For effect scheduling:

- keep queueing separate from invalidation
- prefer state-bit dedupe over `Set`-heavy bookkeeping on the hot path
- treat eager scheduling as an optional layer over the lazy core, not a rewrite
- keep `flush()` viable as the default manual strategy

For dev safety:

- guard debug-only checks with compile-time `__DEV__`
- prod bundles should not retain dev assertions or cycle-guard branches

For `tracking.ts`:

- prefer epoch/version based tracking over `Set` snapshots
- keep graph-shape logic separate from stale-value logic
- ensure branch-switch cleanup is covered by tests

For `core.ts`:

- avoid adding fields unless they materially improve the runtime
- if adding fields, justify them by either correctness or measured performance
- preserve `ReactiveNodeKind` and `EngineHooks` as extension seams for future effects
- do not implement eager effect execution by changing signal/computed semantics in place

## Flush / Topological Mode

If asked to add `flush()` or eager propagation:

- treat it as a second execution strategy
- do not destroy the existing lazy SAC core to force eager semantics
- prefer optional topology support over rewriting the whole runtime around topo order

## Required Tests For Risky Changes

For changes affecting tracking, invalidation, or recompute behavior, Codex should ensure coverage for:

- repeated reads without extra recompute
- same-value writes
- chain propagation
- diamond propagation
- dynamic branch switch
- stale dependency cleanup
- stable dependency-set behavior

## Style Guidance

- keep the core readable
- prefer explicit invariants over cleverness
- do not overfit to a single benchmark
- when tradeoffs exist, document them

## Preferred Output Style

When summarizing runtime work:

- explain what changed
- explain which invariant was protected
- explain benchmark impact only after correctness is addressed

Do not present performance tweaks without naming the correctness assumptions they depend on.
