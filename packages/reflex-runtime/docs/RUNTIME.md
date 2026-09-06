# Reflex runtime contract

`@volynets/reflex-runtime` provides producer, computed-consumer, and watcher
primitives over an intrusive bidirectional graph. It owns invalidation and
lazy stabilization; the host owns watcher scheduling.

This document describes the current implementation. See
[INVARIANTS.md](./INVARIANTS.md) for graph and execution obligations,
[DISPOSE.md](./DISPOSE.md) for teardown, and
[tracking](../src/kernel/shape/tracking/README.md) for dependency resolution.

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
operations are available through the internal surface.

## Producers

A producer stores its committed payload and has `compute === undefined`.
Reading returns the payload and tracks a dependency if a consumer is active.

An equal write returns immediately. A changed write commits the payload,
then synchronously pushes invalidation. The producer normally remains clean;
the write does not set a producer dirty token. Direct consumer subscribers
become `Changed`, while newly invalidated transitive descendants become
`Unknown`.

The runtime does not itself run computed callbacks or watcher effects in push.
Host hooks execute synchronously and can perform operations permitted by their
configuration; therefore "no user code executes during a write" is not a
contract.

If a hook throws, the committed payload is retained. The write unwinds the
propagation scope it opened, but does not roll back or finish the aborted wave.

## Computed consumers and reads

A consumer starts `Changed` with an undefined cached payload. Its first read
executes its callback and tracks dependencies. Clean reads reuse the cache.

Dirty reads force recomputation for `Changed | Visited`; otherwise they
validate unknown dependencies with the pull walker. An unchanged derived
result can stop recomputation of downstream consumers. Equality is applied
after dependency reconciliation, so an unchanged result can still replace
the dependency topology.

Lazy reads register the final dependency edge after stabilization. Eager reads
stabilize without registering that final edge; internal reads made by a dirty
computed callback still collect that computed node's dependencies.
`untracked` temporarily clears the active consumer and restores it on exit,
including throws.

A failed callback leaves `Changed` so a subsequent read retries it. This is
necessary even when the callback was entered from an unknown pull-bubble node
whose upstream dependencies already stabilized. Failed computation does not
roll back dependency mutations.

Computed completion uses its captured entry state, while watcher completion
preserves live reentrant flags. The runtime does not promise that arbitrary
self-mutating computed callbacks converge through automatic repeated execution.

## Tracking and graph mutation

An edge has producer/consumer endpoints, doubly linked incoming/outgoing
membership, and the existing `version` tracking stamp.

`lastIn` is the physical incoming tail. During a callback, `tailIn` bounds
the dependencies already read. The old unmatched suffix remains available for
reuse until it is pruned or eagerly abandoned.

Reads can reuse an expected edge, recognize a duplicate, move an existing
edge after the cursor, or link a new edge. A runtime read extending a prefix
uses the cursor edge's tracking stamp. Nested computation may advance
`trackingEpoch` without changing that already-accepted prefix's stamp.

Successful computation removes remaining unmatched edges. Eager suffix
reconciliation can remove old dependencies earlier, during a read. A callback
throw does not reverse links, moves, stamps, or eager removal, and does not
guarantee retention of the entire previous dependency set.

Local prefix and lookahead limits do not globally bound reconciliation:
suffix scans and outgoing membership probes may traverse full lists.

## Flags

| Flag | Current meaning |
| --- | --- |
| `Unknown` | Upstream may have changed; usually validate before recomputing. |
| `Changed` | Execute without first proving upstream change. |
| `Visited` | Invalidation during execution; may survive watcher completion as a rerun obligation. |
| `Computing` | Callback active; propagation interprets the active incoming prefix accordingly. |
| `Watcher` | Watcher role. |
| `Scheduled` | Host queue ownership, claimed and released separately from execution. |

`DIRTY_STATE = Unknown | Changed`. Dirty bits are not globally exclusive:
`WATCHER_INITIAL_STATE = Changed | Unknown | Watcher | Consumer`, and
computing invalidation can also combine them.

Producer/consumer DEV role constants currently share a bit and are zero in
production. Do not infer a reliable role distinction from those bits alone.
There is no terminal disposal bit.

## Watchers and host scheduling

A watcher callback returns void or one cleanup function. The runtime marks
watchers dirty and may call `onNodeInvalidated`; it does not create a queue or
select asynchronous timing.

`runWatcher` skips clean or proven-stable work. When execution is necessary,
it runs previous cleanup before the callback, outside parent tracking.
Cleanup may dispose the watcher, so executable data is checked again afterward.

After successful execution, a watcher without new `Visited` is cleaned.
With `Visited`, it retains `Unknown | Visited` so a subsequent run executes.
The host still owns queue delivery. Unknown-to-changed promotion can emit
another invalidation; the host owns deduplication.

Internal `claimWatcherSchedule` and `releaseWatcherSchedule` operate on
`Scheduled`. Successful watcher execution does not release a claim.
Callback/cleanup failure clears transient flags, including the claim, so later
invalidation can schedule again using the remaining dependencies.

## Disposal

Generic `disposeNode` unlinks incoming and outgoing edges, then clears
`compute` and `payload`. It leaves node flags unchanged and does not invoke
cleanup. It is graph teardown, not universal terminal-state enforcement.

`disposeWatcher` captures cleanup, tears down the graph and executable data,
clears transient flags, then invokes cleanup. Throwing or recursive cleanup
cannot repeat that captured cleanup through a second disposal.

Post-disposal reads/writes are not guaranteed inert, and eager unlinking does
not establish arbitrary mid-traversal disposal safety. See
[DISPOSE.md](./DISPOSE.md).

## Contexts, batching, and nesting

`createRuntimeContext` creates saved registers and configuration.
`runWithRuntimeContext(context, callback)` activates them and restores the
previous context in a finally block. Configuration, reset, snapshot, and
restore operate on active or explicitly supplied contexts.

Contexts isolate registers/configuration, not graph ownership. Different
contexts can access the same node flags, payloads, and edges. Module registers
are synchronized with saved context objects at the existing boundaries.
Traversal stacks remain shared and protect nested invocations with
`base/top/high` slices.

Source commits and nested production writes are synchronous. A nested write
borrows an existing propagation scope. Its failure must not clear an outer
scope when the caller catches the exception.

Reactive batches defer idle notification. Host work is requested separately;
`onHostFlush` and `onRuntimeIdle` belong to idle delivery, not graph
invalidation. A host combining scheduler and reactive batches closes scheduler
policy before leaving the reactive batch.

The scheduler validation policy is enabled by `__DEV__ && __PROFILE__`.
It rejects reactive reads, watcher execution/disposal from invalidation hooks,
nested propagation, and direct nested pull. It permits pull through an
intervening recomputation and watcher execution at the idle boundary.
Production does not add a queue-only or liveness policy.

## Example

```ts
import {
  createProducer, createConsumer, createWatcher,
  readProducer, readConsumer, writeProducer, runWatcher, disposeWatcher,
} from "@volynets/reflex-runtime";

const count = createProducer(1);
const doubled = createConsumer(() => readProducer(count) * 2);
const watcher = createWatcher(() => {
  console.log(readConsumer(doubled));
});

runWatcher(watcher);       // 2; establish dependencies
writeProducer(count, 3);   // commit and invalidate
runWatcher(watcher);       // 6; host chooses when to execute
disposeWatcher(watcher);
```

## Debugging and validation

The debug entry point provides observation and graph diagnostics. Production
behavior must not depend on it; see [architecture-contract.md](./architecture-contract.md).

The cleanup debug event is observable after the incoming cut and before
outgoing unlink. Debug listeners may therefore see that intermediate state.
Listener exceptions are isolated from runtime bookkeeping.

Tests and benchmarks must distinguish ordinary production execution from
debug/profile execution. Profiling adds counters and graph-degree walks;
profiled timing is not production timing.
