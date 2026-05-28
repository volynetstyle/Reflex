# Reflex Runtime: Walker Algorithms

The walker layer keeps the reactive graph synchronized in two phases:

1. Push invalidation marks subscribers dirty after a write.
2. Pull stabilization verifies and recomputes dirty consumers only when they are read.

The code is split by traversal responsibility. Public entry points remain stable through `index.ts`.

## File Map

### Push Invalidation

- `propagateChange.ts` - main outgoing-edge traversal. Direct subscribers receive the caller's promote token; deeper descendants are marked `Invalid`. Watchers are terminal and are notified without descending further.
- `propagationStack.ts` - shared resume stack for branching propagation and nested watcher callbacks.
- `invalidateBranch.ts` - subscriber state transition helper plus watcher notification dispatch.
- `propagateOnce.ts` - re-entrant/side-fanout propagation used after pull recompute changes a shared consumer.

### Pull Stabilization

- `recomputeNode.ts` - `shouldRecompute` entry point. It handles cheap state checks before dependency walking.
- `recomputeBranch.ts` - compact pull walker for straight and branching dependency graphs.
- `walkerStack.ts` - shared pull-walker stack and stack stats.
- `ensureFresh.ts` - recompute helper that propagates side-fanout only when a recomputed node actually changed.
- `walkerStackStats.ts` - debug counters and retained-capacity trimming shared by push and pull stacks.

## Push Phase

`writeProducer()` commits a changed producer and calls:

```ts
propagate(node.firstOut, Changed);
```

The traversal walks outgoing edges in source-to-subscriber order:

```text
source
  -> direct consumer       Changed
  -> direct watcher        Changed, notify, stop
  -> child of consumer     Invalid
```

Important details:

- Depth-zero siblings keep the original promote token.
- Descending into children always uses `Invalid`.
- A watcher is a terminal sink. It can be notified, but walkers do not traverse through it.
- Re-entrant invalidation and side-fanout use `propagateOnce()` to avoid repeating already visited work.
- `propagationStack.ts` preserves an outer traversal slice while watcher callbacks or nested writes re-enter the walker.

## Pull Phase

`readConsumer()` calls `shouldRecompute()` when a consumer has dirty state.

Cheap exits in `recomputeNode.ts`:

- `Changed` means the consumer must recompute.
- `Invalid | Reentrant` means the consumer must recompute.
- Clean state returns `false`.
- Invalid leaf nodes clear `Invalid` and return `false`.

When dependencies must be inspected, `walkBranch()` uses one stack loop:

```text
dirty dependency     -> refresh or descend
stable dependency    -> resume sibling
confirmed change     -> bubble upward
```

Straight chains stay cheap because the loop keeps stepping through `edge.from` without a separate walker or bailout. Branching graphs use the same stack slice to resume unchecked sibling dependencies.

## Refresh Contract

`refresh(node, edge)` recomputes `node`.

If the value changed and `node` has side subscribers, it calls `propagateOnce(node)`. The current parent path is already being handled by the active pull walker, so only side-fanout needs explicit propagation.

`edge` must be an outgoing edge from `node`; dev builds assert this invariant.

## State Invariants

- `Changed` means a direct upstream dependency definitely changed.
- `Invalid` means an upstream dependency may have changed and must be checked lazily.
- `Tracking` protects the currently tracked dependency prefix during compute.
- `Reentrant` marks nodes touched during nested execution.
- Walker-only bits must not survive a settled traversal unless the node is still actively tracking or re-entrant.

## Edge Invariants

Each dependency edge must be present in both directions:

- `from.firstOut` chain for source-to-subscriber propagation.
- `to.firstIn` chain for dependency inspection.

Removing stale dependencies after recompute must unlink both sides. Otherwise writes to old dependencies can still invalidate consumers and retained edges can leak memory.

## Stack Invariants

Push and pull walkers both use module-scoped stacks to avoid per-read/per-write allocations.

- Always capture `base` from the stack module before pushing.
- Restore the stack high-water mark on every terminal path.
- Trim retained capacity only when a traversal is complete.
- `walkBranch()` owns the stack slice for both straight-chain descent and branching DFS.

## Useful Tests

```bash
pnpm.cmd --filter @volynets/reflex-runtime test -- runtime.walkers.test.ts
pnpm.cmd --filter @volynets/reflex-runtime test -- runtime.walker-stack-stats.test.ts
pnpm.cmd --filter @volynets/reflex-runtime test
```
