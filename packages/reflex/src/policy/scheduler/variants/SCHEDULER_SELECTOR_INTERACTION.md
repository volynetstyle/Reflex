# Ranked Scheduler and Selector Interaction

This note describes how the ranked scheduler cooperates with
`createSelector(...)` and `createProjection(...)`.

## Moving Parts

- `createSelector(...)` and `createProjection(...)` each create an internal
  watcher node.
- That watcher is created through `createWatcherRankedrNode(...)`.
- The watcher priority comes from `options.priority` and defaults to `100`.
- User-facing views are usually ordinary `effect(...)` or `computed(...)`
  nodes that read selector/projection keys.

## What Happens on Source Change

1. A source signal changes.
2. The selector/projection watcher is invalidated.
3. Key-specific consumers that depend on selector/projection outputs are also
   invalidated.
4. In ranked mode, all invalidated watchers enter the scheduler queue.
5. `flush()` drains one queue wave at a time, running higher priorities first.

## Why Priority Matters

The selector/projection watcher is the synchronizing layer between the raw
source value and the keyed signal nodes exposed to views.

That watcher must usually run before lower-priority UI effects, otherwise a
view could observe stale keyed state in the same flush.

That is why selector/projection defaults to priority `100`:

- sync watcher runs first
- keyed signal nodes are updated
- lower-priority effects then read already-synchronized keyed values

## Same-Flush Semantics

Ranked flush processes only the priorities that are already present in the
current wave. If a watcher enqueues more work while flushing:

- the new nodes go back into the scheduler queue
- the current priority wave finishes first
- the newly queued work is collected into the next wave
- that next wave is then sorted by priority and drained

This keeps ordering deterministic and avoids mutating the active bucket list
while it is being iterated.

## Selector / Projection Fast Paths

Both selector cores use two important hot-path optimizations:

- if their internal watcher is clean, reads go straight to the keyed signal
  node
- if the requested key matches the current active key, reads reuse the cached
  current node instead of doing extra map lookups

Projection additionally caches the current keyed node so same-key updates can
rewrite the active value without re-resolving the map entry.

## Cleanup

Selector/projection internal watchers register cleanup through
`registerWatcherCleanup(...)`.

When created inside `withEffectCleanupRegistrar(...)`, their internal watcher
is tied to the outer owner/effect lifecycle. Disposing that cleanup stops
future synchronization work and prevents hidden benchmark/test leaks.
