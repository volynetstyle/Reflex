# Reflex Beta Architecture

## Goal

`@reflex/beta` is a small reactive runtime built around:

- lazy pull evaluation on read
- cheap push invalidation on write
- selective recomputation through version timestamps
- dynamic dependency tracking with edge epochs

The design optimizes for small core size, predictable invariants, and good performance on common lazy workloads.

## Core Model

There are currently two active node kinds and one reserved kind:

- `signal`: source node, stores a value and has no `compute`
- `computed`: derived node, stores a `compute` function and cached value
- `effect`: reserved node kind for future eager reactions

Each node participates in a directed dependency graph:

- incoming edges: dependencies of this node
- outgoing edges: consumers of this node

The core now also exposes light extension points for future effects:

- `ReactiveNodeKind` to distinguish signal/computed/effect roles
- explicit node factories so new roles do not leak constructor details
- a shared computation pipeline for computed/effect execution
- a dedicated effect scheduler layer with cheap queueing and optional eager flush
- `EngineHooks.onEffectInvalidated` as the boundary between invalidation and scheduling

These hooks are architectural preparation only. They should not change current signal/computed behavior.

## Main Invariants

### 1. `Invalid` is only a weak dirty hint

`Invalid` means:

- some upstream node may have changed
- this node should be checked before next read

It does **not** mean the node must recompute.

### 2. `changedAt` and `computedAt` are the source of truth

- `changedAt`: epoch when the node value actually changed
- `computedAt`: epoch when the node was last recomputed

Selective recomputation depends on this rule:

- if a parent recomputed but its value did not change, its `changedAt` does not move
- therefore downstream nodes can skip recompute

### 3. Writes do not traverse the full graph semantically

A write does only:

1. `Object.is` guard
2. update source value
3. bump `changedAt`
4. mark downstream nodes `Invalid`

The write path never recomputes derived nodes.

### 4. Reads resolve freshness lazily

`ensureFresh()` walks only the dirty part of the dependency path required by the read.

For a dirty computed node:

1. first ensure dirty dependencies are fresh
2. then decide whether the node is actually stale
3. recompute only if needed

### 5. Dynamic dependencies are separate from stale logic

Dynamic dependency tracking is about graph shape:

- which edges were used in this recompute
- which old edges should be removed

Stale resolution is about value freshness:

- `Invalid`
- `Obsolete`
- `changedAt`
- `computedAt`

These concerns should stay separate.

## State Bits

`ReactiveNodeState` currently uses:

- `Invalid`: weak push signal
- `Obsolete`: confirmed stale, must recompute
- `Ordered`: reserved for future topo/flush mode
- `Tracking`: dependency set was stable after previous recompute

`Tracking` means:

- previous recompute did not remove old edges
- the graph shape looked stable

It does not mean the node is fresh.

## Dynamic Dependency Tracking

Dynamic dependency cleanup uses:

- `ReactiveNode.trackEpoch`
- `ReactiveEdge.seenEpoch`

### Tracking pass

On recompute:

- node gets a new `trackEpoch`
- every edge actually read during this recompute gets `seenEpoch = trackEpoch`

After recompute:

- any incoming edge with `seenEpoch !== trackEpoch` is stale and gets unlinked

### Stable graph fast path

`Tracking` is kept as a graph-stability flag.

If a node is marked stable and no dependency shape change is detected, the runtime avoids unnecessary graph cleanup work.

If a new dependency appears during a stable pass:

- the `Tracking` bit is cleared
- cleanup runs after recompute

## Recompute Rules

Recompute must preserve these rules:

1. restore `activeComputed` in `finally`
2. update `computedAt` on every recompute
3. update `changedAt` only when the value actually changes
4. cleanup dependency edges after the recompute when tracking requires it

Violating any of these usually breaks SAC or dynamic dependency correctness.

## SAC Contract

SAC means "same as current":

- upstream may be dirty
- upstream may recompute
- downstream should still skip recompute if upstream value stayed equal

This is why `changedAt != computedAt` matters.

## Current Performance Strategy

This runtime is intentionally biased toward:

- lazy reads
- deep chains
- partial reads of larger graphs
- dynamic dependencies without heavy allocation

Production builds also assume:

- dev-only safety checks are guarded by compile-time `__DEV__`
- rollup/terser should erase those branches entirely from prod bundles

It is weaker in eager-friendly workloads such as:

- large fan-in final reads
- eager flush-style propagation
- workloads where precomputing everything once is cheaper than validating on demand

## What Not To Break

When changing the runtime, keep these invariants intact:

- never bump `changedAt` if value is unchanged
- always bump `computedAt` after successful recompute
- do not recompute on write
- do not mix dynamic edge cleanup with stale-value logic
- `Invalid` must stay a hint, not proof of stale data
- `Tracking` must stay a graph-shape stability flag, not a freshness flag

## Future Directions

Possible extensions that fit this architecture:

- eager `flush()` mode as a separate execution strategy
- topo ordering through `OrderList`
- dedicated benchmarking around high fan-in graphs
- cycle detection if DAG invariants are not guaranteed externally

The recommended approach is to preserve the current lazy SAC core and add eager/topological behavior as an optional layer, not by replacing the existing model.
