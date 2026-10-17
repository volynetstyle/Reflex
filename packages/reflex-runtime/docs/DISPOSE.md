# Disposal and cleanup

Owner of teardown and cleanup ordering. This describes the current runtime's eager teardown. There is no `Disposed`
bit or ownership-scope shutdown barrier in this package, and by design no
liveness register: dependency subscriptions are retained until disposal, not
until the last observer leaves. Disposal is therefore the only way a consumer
leaves the graph; see [RUNTIME.md](./RUNTIME.md#dependency-retention) and
[lifetime vs liveness](./performance/lifetime-liveness.md).

## Generic teardown

`disposeNode` in `src/kernel/shape/graph/disposeNode.ts` unlinks all incoming
edges, unlinks all outgoing edges, then clears `compute` and `payload`.

Incoming teardown clears `firstIn/lastIn/tailIn`. Outgoing teardown repairs
subscribers' incoming lists and rewinds a cursor that pointed at a removed
edge. Removed edges have all four list links cleared.

Generic teardown does not normalize state flags and does not invoke a
function-valued payload. With no intervening mutation, repeating teardown is
harmless. This does not make arbitrary later reads, writes, or manual links
inert: graph entry points have no universal dead-node guard.

## Watcher teardown before user cleanup

`disposeWatcher` in `src/kernel/engine/watcher.ts`:

1. Captures the function-valued cleanup payload, if present.
2. Performs generic teardown.
3. Clears `Changed | Unknown | Visited | Revalidate | Computing | Scheduled`.
4. Invokes captured cleanup outside parent tracking.
5. Leaves payload undefined and records successful disposal in debug mode.

The callback and payload are already cleared before cleanup runs. Recursive
disposal therefore cannot invoke the same saved cleanup again. If cleanup
throws, graph teardown and flag clearing remain effective; the exception
propagates and the success debug event is not emitted. Repeating disposal does
not retry that cleanup.

## Rerun cleanup

When a dirty watcher needs execution, its previous payload is cleared before
old cleanup runs. Cleanup runs with no active consumer, preventing incidental
reads from attaching to a parent computation. The previous consumer is restored
even when cleanup throws.

The watcher checks `compute` again after cleanup, because cleanup may dispose
it. It also checks after the callback, preventing a returned cleanup payload
from being stored on a watcher disposed during that callback.

These checks do not stop arbitrary JavaScript still running inside the
callback from making further reads or writes. The runtime stores one cleanup
payload per watcher; it does not impose a separate ownership-tree LIFO order.

## Failure

A throwing cleanup or callback does not roll topology back; recovery restores
flags only, and the remaining graph is not guaranteed to contain every
dependency of the previous successful execution. The recovery states (and
when a failed watcher stays retryable) are owned by
[INVARIANTS.md §3](./INVARIANTS.md#3-pruning-and-failure).

## Active walks

Eager unlinking alone does not establish arbitrary mid-traversal disposal
safety: walkers retain edge continuations, and unlink clears edge links. The
development scheduler policy therefore rejects watcher disposal from
`onNodeInvalidated`
([RUNTIME.md](./RUNTIME.md#development-scheduler-policy)); production has no
universal terminal-state barrier. Post-disposal reads are not specified as
universally inert; stronger ownership contracts in callers are outside this
package.

Execution domains (`src/domain`) add a safe-point queue above this teardown:
`domain.teardown(fn)` runs `fn` immediately at managed depth zero and
otherwise at the outermost managed exit. `reflex-framework` uses it to defer
`disposeWatcher` of owned effects while running their user cleanups
synchronously. The kernel teardown itself is unchanged.

## Characterization

- `test/runtime/contracts/runtime.lifecycle.test.ts`: eager teardown and
  cleanup outside parent tracking.
- `test/runtime/contracts/runtime.resilience.test.ts`: callback/cleanup
  failure, retry after later invalidation, and recursive disposal.
- `test/runtime/topology/runtime.graph-utilities.test.ts`: reciprocal unlink.
- `test/dev/runtime/runtime.scheduler-policy.dev.test.ts`: hook policy.
