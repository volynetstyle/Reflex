# Runtime Architecture For Beta Port

## Goal

Port the semantic core of `reflex` into `@reflex/runtime` without dragging over accidental file layout or outdated execution policy.

The target runtime should preserve the beta contract:

- lazy pull validation on read
- cheap push invalidation on write
- selective recomputation via separate change and validation epochs
- dynamic dependency tracking as an orthogonal concern
- effect scheduling as a layer above the lazy core

This document defines the architectural target, the module boundaries, and a migration path.

## Design Principles

### 1. Keep the lazy core small

The core should know how to:

- represent nodes and edges
- mark downstream nodes as maybe dirty
- refresh a dirty node on demand
- recompute and reconcile dependencies

The core should not decide:

- when effects run
- which host queue is used
- how priorities work
- whether eager flushing exists

### 2. Separate shape, graph, freshness, and policy

These concerns must not collapse into one module:

- shape: node and edge layout, flags, epochs
- graph: link, unlink, cleanup, traversal helpers
- freshness: invalidation, stale checks, ensure-fresh walker
- execution policy: effect scheduling and host flush semantics

### 3. `Invalid` is a hint, not proof

Write propagation must only say:

> "something upstream may have changed"

It must not say:

> "recompute everything now"

This preserves SAC behaviour and keeps writes cheap.

### 4. Dynamic tracking is graph maintenance, not freshness logic

Tracking answers:

- which edges were read in this pass
- which old edges should be removed

It must stay independent from:

- `Invalid`
- `Obsolete`
- stale/value checks

### 5. Effects are not computeds with extra flags

`computed` and `effect` may share execution plumbing, but they diverge semantically:

- `computed` produces a value and stays pure/lazy
- `effect` owns cleanup and is driven by a scheduler

The scheduler boundary should remain explicit.

## Target Layering

The runtime package should be organized around six layers:

### 1. `core`

Defines the stable semantic model:

- `ReactiveNode`
- `ReactiveEdge`
- `ReactiveNodeKind`
- `ReactiveNodeState`
- epoch fields: `t`, `v`, `s`, `w`
- `EngineContext`
- node factories

This layer contains no public API ergonomics and no scheduling policy.

### 2. `graph`

Low-level graph mutation helpers:

- `linkEdge`
- `unlinkEdge`
- `unlinkAllSources`
- `connect`
- edge search/query helpers if needed

This layer is purely structural.

### 3. `tracking`

Dependency capture and cleanup:

- `trackRead`
- `cleanupStaleSources`

This layer depends on `core` and `graph`, but not on scheduling.

### 4. `walkers`

Freshness and invalidation algorithms:

- `markInvalid`
- `needsUpdate`
- `ensureFresh`

This is the heart of the lazy runtime semantics.

### 5. `engine`

Node execution rules:

- `writeSignal`
- `batchWrite`
- `recompute`
- `runEffect`
- `disposeEffect`

This layer composes `tracking` and `walkers`, but still does not choose host scheduling.

### 6. `api`

User-facing runtime surface:

- `createRuntime`
- `signal`
- `computed`
- `memo`
- `effect`
- `flush`

This layer owns ergonomics only.

## Recommended File Layout

The current `runtime/src` tree already has some useful folders, but the target layout should be aligned to semantics rather than legacy names:

```text
src/
  core/
    context.ts
    node.ts
    edge.ts
    state.ts
    kind.ts
    factories.ts
    index.ts
  graph/
    link.ts
    unlink.ts
    connect.ts
    index.ts
  tracking/
    trackRead.ts
    cleanupStaleSources.ts
    index.ts
  walkers/
    markInvalid.ts
    needsUpdate.ts
    ensureFresh.ts
    index.ts
  engine/
    writeSignal.ts
    batchWrite.ts
    recompute.ts
    effect.ts
    index.ts
  scheduler/
    EffectScheduler.ts
    index.ts
  api/
    runtime.ts
    signal.ts
    computed.ts
    effect.ts
    index.ts
  index.ts
```

If a full move is too disruptive, keep the current folders temporarily, but preserve the layer boundaries above.

## Canonical Data Model

The beta shape should become the canonical runtime model.

### `ReactiveNode`

Required fields:

- `kind`: explicit role (`Signal`, `Computed`, `Effect`)
- `t`: epoch of actual value change
- `v`: epoch of last successful validation/recompute
- `state`: bitset of runtime flags
- `compute`: derivation/effect body or `null`
- `payload`: current value or cleanup payload
- `s`: dependency tracking epoch
- `w`: per-pass work marker
- `firstOut`: downstream consumers
- `firstIn`: upstream dependencies

Optional fields can exist for ownership or topo work, but they must not dilute the lazy-core contract.

### `ReactiveEdge`

Required fields:

- `from`
- `to`
- `nextOut`
- `nextIn`
- `s`

If `@reflex/core` intrusive graph helpers are reused later, keep the same semantic contract.

### `ReactiveNodeState`

The beta state model should drive the port:

- `Invalid`
- `Obsolete`
- `Tracking`
- `SideEffect`
- `Disposed`
- `Computing`
- `Scheduled`

The current runtime shape is missing parts of this model and mixes some older assumptions. That should be corrected before deeper migration.

## Execution Semantics

### Write path

The write path must stay minimal:

1. `Object.is` guard
2. write payload
3. update `t`
4. mark downstream as `Invalid`
5. enqueue effects only through the effect-invalidated boundary

Write must not:

- recompute computeds
- clear stale state by traversal
- depend on scheduler internals

### Read path

The read path for a computed should be:

1. track dependency if inside another computation
2. return cached payload if already fresh
3. otherwise run `ensureFresh`
4. return payload

### Freshness rule

The main stale test should stay:

```text
node is fresh iff node.v >= max(source.t)
```

with special cases:

- `v === 0` means never computed
- `Obsolete` forces recompute
- `Invalid` only requests validation

### Recompute rule

A recompute must:

1. save/restore `activeComputed`
2. bump tracking epoch
3. execute compute
4. reconcile stale inbound edges
5. always update `v`
6. update `t` only if observable value changed
7. clear dirty flags

This is the semantic centre of SAC correctness.

## Scheduler Boundary

The scheduler should be effect-only.

The boundary is:

- graph invalidation calls `ctx.notifyEffectInvalidated(node)`
- scheduler decides whether to enqueue, dedupe, or flush

The scheduler must not:

- decide computed freshness
- traverse computed subgraphs for validation
- become a hidden second execution engine

This keeps eager mode as an optional layer over the same lazy core.

## Mapping Beta To Runtime

This is the clean semantic mapping for the port:

- `beta/src/core.ts` -> `runtime/src/core/*`
- `beta/src/graph.ts` -> `runtime/src/graph/*`
- `beta/src/tracking.ts` -> `runtime/src/tracking/*`
- `beta/src/walkers.ts` -> `runtime/src/walkers/*`
- `beta/src/engine.ts` and `beta/src/engine/*` -> `runtime/src/engine/*`
- `beta/src/effect_scheduler.ts` -> `runtime/src/scheduler/EffectScheduler.ts`
- `beta/src/api.ts` -> `runtime/src/api/*`

What should *not* be ported mechanically:

- exact filenames if they obscure boundaries
- temporary comments or study-only wording
- beta-specific public API quirks if runtime already has a better wrapper surface

## Architecture Risks In Current `@reflex/runtime`

The current runtime tree has the right intuition, but there are several mismatches with the beta contract:

### 1. Node model is semantically split

Current runtime still models roles as `Producer/Consumer/Recycler`, while the beta core is centered on `Signal/Computed/Effect` plus explicit state flags and epochs.

Risk:

- execution code must infer semantics indirectly
- effect policy bleeds into node metadata

### 2. Freshness contract is not canonical

The current runtime has older invalidation/recompute paths and partial bit usage. It should converge on the beta `t/v/s/w` model as the single source of truth.

Risk:

- stale checks become harder to reason about
- SAC regressions appear during migration

### 3. Scheduler and walker responsibilities are blurry

Some current scheduler code is incomplete, while older runtime code suggests a broader flush-driven execution model.

Risk:

- reintroducing eager semantics into the core
- duplicate execution paths for computeds and effects

### 4. Legacy shape folders can hide semantics

`reactivity/shape/methods` is a useful implementation location, but architecturally it mixes data model and behaviour too closely for a clean beta port.

Risk:

- graph mutations and state transitions stay coupled
- invariants become implicit

## Migration Plan

### Phase 1. Freeze the semantic contract

Before broad edits:

- adopt the beta node/state/epoch model as the runtime contract
- treat this document as the architectural source of truth

### Phase 2. Normalize core types

Refactor runtime internals so that:

- `ReactiveNode` matches beta semantics
- `ReactiveEdge` carries tracking epoch
- `EngineContext` owns `epoch`, `activeComputed`, traversal stacks, and hooks

This phase should not yet change the public API.

### Phase 3. Move freshness logic behind walkers

Consolidate all dirty checking into:

- `markInvalid`
- `needsUpdate`
- `ensureFresh`

Avoid duplicate logic in `api/read`, `api/write`, or scheduler code.

### Phase 4. Unify recompute pipeline

Use one recompute path for both:

- `computed`
- `effect`

and let effect-specific lifecycle behaviour live in the engine/scheduler boundary.

### Phase 5. Rebuild effect scheduling on hooks

Keep effect queueing behind:

- `onEffectInvalidated`

and make `flush()` only about effect execution, not computed recomputation.

### Phase 6. Remove legacy execution assumptions

After parity tests pass:

- delete old propagation paths that imply eager recomputation
- remove duplicated node-role abstractions
- simplify public docs around the new model

## Testing Strategy For The Port

Migration should be locked by the beta semantic suite, especially:

- basic signal/computed behaviour
- memoization and SAC
- dynamic dependency churn
- scheduling/effect tests
- safety tests

Recommended approach:

1. Port core invariants first
2. Reuse beta tests against runtime internals or public API adapters
3. Only then clean up folder structure

## Non-Goals

This port should not try to solve all future architecture at once:

- no mandatory topo ordering in the first port
- no priority scheduler in the first port
- no microtask host integration in the first port
- no public API redesign beyond what is required for semantic parity

## Practical Recommendation

Treat `reflex` as the semantic reference implementation and `@reflex/runtime` as the package that should absorb it in a cleaner layered form.

The right move is:

- port the beta model
- preserve the runtime package boundary
- restructure around semantic layers
- keep host scheduling as an explicit outer layer

That gives you a runtime that is smaller in concept, easier to test, and much safer to extend.
