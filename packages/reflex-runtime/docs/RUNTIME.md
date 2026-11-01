# Runtime contract

What an integrator of `@volynets/reflex-runtime` can rely on. The state model
behind it is [INVARIANTS.md](./INVARIANTS.md); the watcher lifecycle and
failure rules are stated formally in [SEMANTIC_CONTRACT.md](./SEMANTIC_CONTRACT.md).

The runtime owns invalidation and lazy stabilization. The host owns when
watchers run.

## Operations

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

Operations act on the active runtime context; none takes a context argument.
Equality is `Object.is` (`NaN` equals `NaN`, `-0` differs from `0`);
`writeProducer` takes no comparator. `ReactiveNode` is exported as a type. The
constructor, graph primitives, state constants, `disposeNode` and scheduler
integration live in `/internal`, which has no stability guarantee.

## Producers

A read returns the committed payload and, inside a tracked computation,
records a dependency. An equal write returns immediately. A changed write
commits, then synchronously invalidates: direct dependents must recompute,
transitive ones must validate. No computed callback or watcher runs during
that push, but host hooks do, so "no user code runs during a write" is not a
contract. If a hook throws, the committed payload stays; the aborted wave is
neither rolled back nor finished.

## Computed consumers

A consumer computes on its first read and records what it read. A clean read
returns the cache. A dirty read recomputes when a direct dependency changed,
otherwise validates its dependencies first; an equal result stops downstream
work. Equality is checked after the dependency list is reconciled, so an
equal result can still change the dependency topology.

- Lazy reads (`readConsumer`, `readConsumerLazy`) record the read edge after
  stabilizing. Eager reads (`readConsumerEager`) stabilize without recording
  it.
- `untracked` clears the active consumer and restores it on exit, including
  throws.
- A failed callback is retried by the next read. Dependency edits already made
  by the failed attempt stay.
- A computed that writes a source it has already read is not guaranteed to
  converge; today it commits the value computed before the write (F1, open).

## Watchers and host scheduling

A watcher callback returns nothing or one cleanup function. The runtime marks
watchers dirty and calls `onNodeInvalidated`; it has no queue and chooses no
timing.

`runWatcher` skips clean work and work proven stable by validation. When the
watcher must execute, the previous cleanup runs first, untracked; then the
callback runs tracked. A watcher invalidated while it validates or executes
keeps the obligation and is handed to `onNodeInvalidated` again, unless the
host owns it through `claimWatcherSchedule`. A transitive invalidation only
re-validates: the watcher executes again only if a value it reads changed
(L1–L3). Invalidation may be reported more than once; the host deduplicates.
Successful execution does not release a claim.

When cleanup, callback or validation throws, the error reaches the host. A
watcher whose dependency is still dirty stays retryable on a later drain;
otherwise it returns to idle and the next source change schedules it.

### Hooks

| Hook                | Runs                                                  | May                                                                                                  |
| ------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `onNodeInvalidated` | during propagation, once per newly dirty watcher      | enqueue only: no `runWatcher`, `readProducer`, `readConsumer`, `writeProducer` or `disposeWatcher`   |
| `onRuntimeIdle`     | after propagation, pull and watcher work have settled | drain the queue synchronously, or schedule it (`queueMicrotask`, `requestAnimationFrame`, host task) |

If a drain inside `onRuntimeIdle` creates work, the runtime delivers another
idle checkpoint once it is idle again. Nested hook calls are allowed. If a
hook throws during propagation, the runtime clears the active walk and
rethrows; the next write starts clean.

With `__DEV__ && __PROFILE__` the runtime reports a broken host contract
where it happens; production adds no checks.

| Code                                     | Cause                                                     |
| ---------------------------------------- | --------------------------------------------------------- |
| `REFLEX_SCHEDULER_REENTRANT_FLUSH`       | `runWatcher` called from `onNodeInvalidated`              |
| `REFLEX_SCHEDULER_REACTIVE_READ_IN_HOOK` | `readProducer` or `readConsumer` called from a hook       |
| `REFLEX_NESTED_PULL`                     | a pull walk started directly inside another               |
| `REFLEX_NESTED_PROPAGATION`              | a write started propagation inside another propagation    |
| `REFLEX_HOST_HOOK_REENTERED_RUNTIME`     | a hook returned with the runtime's phase or depth changed |

Pull through an intervening recomputation and watcher execution at the idle
boundary are allowed.

## Disposal

`disposeWatcher`:

1. captures the cleanup payload, if any;
2. unlinks the watcher from both directions and clears `compute` and
   `payload`;
3. clears its dirty, execution and scheduling bits;
4. runs the captured cleanup outside any tracking.

Recursive disposal cannot run the same cleanup twice. If the cleanup throws,
teardown has already happened and the error propagates; repeating disposal
does not retry it.

`disposeNode` (internal) unlinks both directions and clears `compute` and
`payload`; it does not run a cleanup and does not touch state bits. There is
no disposed bit: reads, writes and links after disposal are not guaranteed
inert. Disposing a watcher from `onNodeInvalidated` is forbidden, because
push holds edge continuations.

Before a rerun the old cleanup is consumed, then run untracked; the previous
consumer is restored even if it throws. The watcher is checked again after
the cleanup and after the callback, since either may dispose it.

Execution domains (`src/domain`) queue teardown to a safe point:
`domain.teardown(fn)` runs `fn` now at managed depth zero, otherwise at the
outermost managed exit.

## Dependency retention

A consumer stays linked to its sources until it is disposed. Every edge is
reciprocal, so a producer's subscriber list strongly references every consumer
that read it: a consumer the application dropped is not collectable while its
sources live, keeps its closure, and costs one visited edge per write to an
invalidated source. Losing the handle does not end the lifetime.

- Raw consumers are released with `disposeNode`. The package root has no
  consumer disposal.
- Owned computations (`@volynets/reflex-framework`) and the facade's
  `createDisposableComputed` carry that obligation for the caller.
- There is no liveness bit, observer count or second edge class; observers
  never touch upstream edges. Dormant propagation is bounded by dirty-state
  cutoff instead. The measurement behind this choice is in
  [MODEL.md](./MODEL.md) §7.

## Contexts, batches and nesting

`createRuntimeContext` creates a register bank and configuration;
`runWithRuntimeContext(context, fn)` activates it and restores the previous
one in `finally`. Contexts isolate registers and configuration, not nodes:
two contexts can reach the same graph.

Writes commit synchronously, nested ones included. A nested write borrows the
outer propagation scope; if the outer callback catches its error, the outer
scope survives. A reactive batch defers idle notification, not commits.
`onHostFlush` and `onRuntimeIdle` belong to idle delivery, not invalidation. A
host combining scheduler and reactive batches closes the scheduler batch
before leaving the reactive one.

## Integration surface

Sibling Reflex packages use a named subset of `/internal` and never read
registers, state bits or edge fields; `check:package-boundaries` enforces it
([runtime-integration.md](../../../docs/architecture/runtime-integration.md)).

| Operation                              | Answer or effect                                                                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isTracking()`                         | a computation is collecting dependencies now; false inside `untracked`                                                                             |
| `activeTracking`                       | live binding, non-null exactly while `isTracking()`; compare with `null` only                                                                      |
| `isContextSettled(context?)`           | the context is outside propagation and tracked evaluation                                                                                          |
| `hasObservers(node)`                   | some consumer depends on the node                                                                                                                  |
| `disposeNodeIfUnobserved(node)`        | disposes the node when nothing observes it; returns whether it did                                                                                 |
| `suspendConsumerIfUnobserved(node)`    | unlinks the sources of an unobserved consumer and drops its value, keeping its computation                                                         |
| `hasPendingValidation(node)`           | the node holds an invalidation it has not validated                                                                                                |
| `takeScheduledWatcher(node)`           | dequeue step: releases queue ownership, answers whether the watcher is still live                                                                  |
| `shouldRetryWatcherAfterFailure(node)` | after a throwing run: a failed dependency validation left the watcher dirty and it needs a later retry; callback and cleanup failures answer false |
| `invalidateWatcher(node)`              | the next run executes the callback; the host is notified                                                                                           |
| `flushPendingRuntimeIdle()`            | delivers a pending idle notification; checks for one itself                                                                                        |

## Debugging

The debug entry point observes; production behavior never depends on it
([DIAGNOSTICS.md](./DIAGNOSTICS.md)). The cleanup debug event fires after the
incoming cut and before the outgoing unlink, so a listener can see that
intermediate state. Listener exceptions are isolated. Profiling adds counters
and graph walks: profiled time is not production time.
