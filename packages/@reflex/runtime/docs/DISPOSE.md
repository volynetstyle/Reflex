# Disposal Protocol

This runtime uses a strict disposal contract.

The goal is simple: once a node or scope starts dying, the graph must stop
treating it as a live participant immediately.

## Core Rules

1. Dead is terminal.

Once `Disposed` is set, the node never becomes live again. There is no reuse,
reactivation, or temporary death state.

2. Dead nodes do not participate in graph operations.

After disposal starts, graph entry points must not:

- track the node
- invalidate it
- recompute it
- schedule it
- attach new dependencies to it

Allowed behavior is limited to:

- idempotent ignore / early return
- internal teardown of existing graph links

3. All graph entry points are dead-safe.

If a dead node reaches a public runtime path, production behavior must stay
safe and inert. Development builds may assert, but production should early
return instead of corrupting the graph.

4. Dispose is idempotent.

Repeated disposal must not rerun teardown logic or recreate side effects.

5. Mark dead before teardown.

The state barrier happens first. External cleanup runs only after the node or
scope is already invalid for new graph participation.

6. Queued or delayed work checks liveness before commit.

Schedulers, event deliveries, cleanups, async continuations, and deferred
callbacks must verify that their target is still live before mutating graph
state or committing payload.

7. Disposal is reentrancy-safe.

If disposal re-enters the same node or scope while teardown is already in
progress, the nested call must be harmless. The runtime uses terminal
`Disposed` / `closing` barriers plus idempotent early returns for this.

8. This runtime chooses eager detach.

When a node is disposed, both directions of graph connectivity are torn down:

- incoming edges are removed
- outgoing edges are removed
- the node becomes unreachable from future graph traversal

This is the single disposal model for runtime nodes. We do not rely on
"eventual unlink" for correctness.

9. Half-detached visibility is not a valid live state.

Physical edge unlink may be performed incrementally inside the disposal routine,
but the algorithmic barrier is the dead mark that happens first.

That means:

- public graph entry points must treat the node as dead before detach completes
- no algorithm may rely on observing a partially detached node as still live
- traversal must tolerate one side of an edge disappearing before the other

10. Active graph algorithms tolerate death mid-traversal.

Propagation, pull verification, scheduler flushes, and cleanup paths must
remain correct if a node becomes dead during the walk itself.

The intended behavior is:

- skip dead work
- continue safely when possible
- never corrupt traversal invariants trying to "finish honestly"

11. Dead nodes emit no new observable graph effects.

Disposed nodes do not start new computations, do not publish fresh downstream
invalidation, and do not accept new cleanup registrations.

12. Scope disposal uses a shutdown barrier.

Ownership scopes follow the same ordering:

- mark the whole subtree as `closing`
- reject new children / cleanups / owned effects
- dispose inside-out
- mark each scope fully disposed

13. Correctness wins races.

If disposal collides with queued work, stale work is dropped. We prefer doing
nothing over letting dead state mutate the graph one last time.

## Forbidden Behavior

The following is explicitly forbidden:

- reactivating a dead node
- writing to a dead node
- tracking from or into a dead node
- recomputing a dead node
- registering cleanup after scope closing starts
- creating owned effects inside a closing or disposed scope
- committing stale queued or async results after the target died

## Runtime Mapping

The protocol is enforced by the current implementation in these places:

- `src/reactivity/shape/methods/connect.ts`
  `disposeNode()` marks terminal death and eagerly detaches both incoming and
  outgoing graph edges.
- `src/api/read.ts`
  dead reads do not retrack or reactivate disposed nodes.
- `src/api/write.ts`
  dead producers reject writes.
- `src/api/watcher.ts`
  watcher reruns stop if disposal happens during cleanup, and dead watchers do
  not commit new cleanup payloads.
- `src/reactivity/walkers/*`
  propagation and pull verification stay inert on dead input, including
  mid-traversal disposal races.

The ownership shutdown barrier lives in:

- `packages/reflex-dom/src/ownership/ownership.cleanup.ts`
- `packages/reflex-dom/src/ownership/ownership.scope.ts`
- `packages/reflex-dom/src/ownership/ownership.effect.ts`

## Dev Assertions Worth Keeping

These checks are intentionally useful in debug builds:

- `track into dead consumer`
- `track from dead source`
- `recompute dead node`
- `write into dead node`
- `register cleanup into disposed scope`
- `useEffect in disposed scope`

Production behavior should remain safe even when callers violate the protocol.
