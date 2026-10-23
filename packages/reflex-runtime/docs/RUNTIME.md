# Reflex runtime contract

`@volynets/reflex-runtime` provides producer, computed-consumer, and watcher
primitives over an intrusive bidirectional graph. It owns invalidation and
lazy stabilization; the host owns watcher scheduling.

This is the public contract: what an integrator can rely on. The internal
state model behind it is [INVARIANTS.md](./INVARIANTS.md), teardown is
[DISPOSE.md](./DISPOSE.md), and the observable watcher lifecycle is formalized
in [SEMANTIC_CONTRACT.md](../test/differential/docs/SEMANTIC_CONTRACT.md).

## Public operations

The package root exports these creation and execution operations:

```ts
createProducer(payload)
createConsumer(callback)
createWatcher(callback)
readProducer(node)
writeProducer(node, value)
readConsumer(node, mode?) // ConsumerReadMode.lazy is the default
readConsumerLazy.call(node)
readConsumerEager(node)
runWatcher(node)
disposeWatcher(node)
untracked(callback)
```

Read/write operations use the active runtime context; they do not take an
optional context argument. Equality is `Object.is`; `writeProducer` does not
take a comparator argument.

`ReactiveNode` is exported as a type from the root. The constructor, graph
primitives, state constants, `disposeNode`, and scheduler integration
operations are available through the internal surface (`/internal`), which has
no stability guarantee.

## Producers

A producer stores its committed payload. Reading returns the payload and
tracks a dependency if a consumer is active.

An equal write returns immediately. A changed write commits the payload, then
synchronously invalidates: direct dependents must recompute, transitive ones
must validate. The runtime does not run computed callbacks or watcher effects
during that push. Host hooks execute synchronously and can perform operations
their configuration permits, so "no user code executes during a write" is not
a contract.

If a hook throws, the committed payload is retained. The write unwinds the
propagation scope it opened, but does not roll back or finish the aborted wave.

## Computed consumers and reads

A consumer computes on its first read and tracks the dependencies it read.
Clean reads reuse the cache. A dirty read recomputes when a direct dependency
changed and otherwise validates its dependencies first; an unchanged result
stops downstream recomputation. Equality is applied after dependency
reconciliation, so an unchanged result can still replace the dependency
topology.

Lazy reads register the final dependency edge after stabilization. Eager reads
stabilize without registering it; reads made inside a dirty computed's callback
still collect that computed's dependencies. `untracked` clears the active
consumer and restores it on exit, including throws.

A failed callback is retried by the next read. A failure does not roll back
dependency mutations already made. The runtime does not promise that a computed
which writes a source it already read converges, and currently commits a value
computed before that write (F1, open).

Dependency tracking, reordering and pruning: [INVARIANTS.md §4](./INVARIANTS.md#4-cursor-and-tracking-stamp)
and [tracking](../src/kernel/shape/tracking/README.md).

## Watchers and host scheduling

A watcher callback returns void or one cleanup function. The runtime marks
watchers dirty and calls `onNodeInvalidated`; it does not create a queue or
choose timing.

`runWatcher` skips clean or proven-stable work. When execution is necessary,
it runs the previous cleanup before the callback, outside parent tracking.
Cleanup may dispose the watcher, so executable data is checked again afterward.

A watcher invalidated while it validates or executes keeps that obligation and
is handed to the host again with `onNodeInvalidated`, unless the host already
owns it through `claimWatcherSchedule`. A transitive invalidation only
re-validates: the watcher executes again only if a value it reads actually
changed (contract L1-L3). Invalidation can be reported more than once; the host
deduplicates. Successful execution does not release a claim.

When cleanup, callback or validation throws, the error propagates to the host.
A watcher whose dependency is still dirty (for example, written by the failing
step) remains retryable on a later drain; otherwise it returns to idle and the
next source change schedules it again. Exact recovery states:
[INVARIANTS.md §3](./INVARIANTS.md#3-pruning-and-failure).

### Development scheduler policy

With `__DEV__ && __PROFILE__`, the runtime validates the host contract at the
boundary where it is broken. It rejects reactive reads, watcher execution and
watcher disposal from `onNodeInvalidated`, nested propagation, and direct
nested pull. It permits pull through an intervening recomputation and watcher
execution at the idle boundary. Production adds no queue-only or liveness
policy.

## Disposal

`disposeWatcher` tears the watcher out of the graph, then runs its cleanup
once; generic `disposeNode` (internal) unlinks and clears executable data
without running cleanup. Post-disposal reads and writes are not guaranteed
inert. Details: [DISPOSE.md](./DISPOSE.md).

## Dependency retention

Reflex intentionally retains dependency subscriptions for live owned
computations. Dormant propagation is bounded by dirty-state cutoff rather than
by dynamically disconnecting inactive dependency cones. There is no liveness
bit, active-subscriber count or second edge class in the node shape, and
observer changes never touch upstream edges.

The consequence for raw use is a lifecycle obligation. Every edge is
reciprocal, so a producer's out-list strongly references each consumer that
has read it. A consumer the application no longer references is not
garbage-collectable while its sources are alive; it stays linked, keeps its
closure, and adds one visited edge per write to an invalidated source. Losing
the handle does not end its lifetime. Raw consumers are released with
`disposeNode` (internal surface); the package root has no consumer disposal
operation. Owned computations (`@volynets/reflex-framework` hooks) and the
facade's `createDisposableComputed` carry that obligation for the caller.

The measured cost of the policy, and where dynamic liveness wins instead, is
in [lifetime vs liveness](./performance/lifetime-liveness.md).

## Contexts, batching, and nesting

`createRuntimeContext` creates saved registers and configuration.
`runWithRuntimeContext(context, callback)` activates them and restores the
previous context in a finally block. Configuration, reset, snapshot, and
restore operate on active or explicitly supplied contexts. Contexts isolate
registers and configuration, not graph ownership: different contexts can
access the same nodes. Register-level rules: [INVARIANTS.md §8](./INVARIANTS.md#8-execution-contexts).

Source commits and nested production writes are synchronous. A nested write
borrows an existing propagation scope; its failure must not clear an outer
scope when the caller catches the exception.

Reactive batches defer idle notification. Host work is requested separately;
`onHostFlush` and `onRuntimeIdle` belong to idle delivery, not graph
invalidation. A host combining scheduler and reactive batches closes scheduler
policy before leaving the reactive batch.

## Integration contract

Sibling Reflex packages use a named subset of `/internal` and never read
registers, state flags or edge fields. The subset is enforced by the
repository's `check:package-boundaries`; the rationale is in
[runtime-integration.md](../../../docs/architecture/runtime-integration.md).
The semantic operations it adds:

| Operation                              | Answer or effect                                                                                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isTracking()`                         | A reactive computation is collecting dependencies now; false inside `untracked`.                                                                    |
| `activeTracking`                       | Live binding that is non-null exactly while `isTracking()` is true. For hot paths that cannot afford a call; compare it with `null` only.           |
| `isContextSettled(context?)`           | The context is outside propagation and tracked evaluation, whether it is active or saved.                                                           |
| `hasObservers(node)`                   | Some consumer depends on the node.                                                                                                                  |
| `disposeNodeIfUnobserved(node)`        | Disposes the node when nothing observes it; returns whether it did.                                                                                 |
| `suspendConsumerIfUnobserved(node)`    | Unlinks sources and drops the cached value of an unobserved consumer, keeping its computation; the next read evaluates.                             |
| `hasPendingValidation(node)`           | The node holds an invalidation it has not validated.                                                                                                |
| `takeScheduledWatcher(node)`           | Scheduler dequeue step: releases queue ownership and answers whether the watcher is still live; a watcher disposed while queued answers false.      |
| `shouldRetryWatcherAfterFailure(node)` | After a throwing run: a failed dependency validation left the watcher dirty and it needs a later retry. Callback and cleanup failures answer false. |
| `invalidateWatcher(node)`              | The next run executes the callback; the host is notified through `onNodeInvalidated`.                                                               |

`flushPendingRuntimeIdle()` owns its own pending check; callers invoke it
without inspecting runtime state.

## Example

```ts
import {
  createProducer,
  createConsumer,
  createWatcher,
  readProducer,
  readConsumer,
  writeProducer,
  runWatcher,
  disposeWatcher,
} from "@volynets/reflex-runtime";

const count = createProducer(1);
const doubled = createConsumer(() => readProducer(count) * 2);
const watcher = createWatcher(() => {
  console.log(readConsumer(doubled));
});

runWatcher(watcher); // 2; establish dependencies
writeProducer(count, 3); // commit and invalidate
runWatcher(watcher); // 6; host chooses when to execute
disposeWatcher(watcher);
```

## Debugging and validation

The debug entry point provides observation and graph diagnostics. Production
behavior must not depend on it; see
[architecture-contract.md](./architecture-contract.md) and
[DIAGNOSTICS.md](./DIAGNOSTICS.md).

The cleanup debug event is observable after the incoming cut and before
outgoing unlink. Debug listeners may therefore see that intermediate state.
Listener exceptions are isolated from runtime bookkeeping.

Tests and benchmarks must distinguish ordinary production execution from
debug/profile execution. Profiling adds counters and graph-degree walks;
profiled timing is not production timing.
