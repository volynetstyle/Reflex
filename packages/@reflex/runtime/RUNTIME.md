# Reflex Runtime

This document describes the actual public surface and observable semantics of
`@reflex/runtime` as it exists in this package today.

It focuses on three things:

- what the package exports
- what `producer`, `consumer`, and `watcher` nodes actually do
- which internal behaviors are stable enough to rely on when extending the runtime

For algorithm-level walkthroughs, see:

- [`README.md`](./README.md)
- [`DISPOSE.md`](./DISPOSE.md)
- [`src/reactivity/walkers/README.md`](./src/reactivity/walkers/README.md)
- [`study/`](./study/)

## What This Package Is

`@reflex/runtime` is a low-level reactive graph engine.

It does not provide:

- a `flush()` API
- a built-in scheduler
- a `runtime` singleton export
- signal/computed/effect convenience factories
- an event-emitter style public API

Instead, it gives you explicit primitives:

- `ReactiveNode`
- read/write operations
- watcher execution/disposal
- execution contexts with host hooks
- low-level state constants

## Public Exports

The package root currently exports:

```ts
export {
  readProducer,
  writeProducer,
  readConsumer,
  runWatcher,
  disposeWatcher,
  ProducerComparator,
  ConsumerReadMode,
  untracked,
} from "./api";

export {
  createExecutionContext,
  getDefaultContext,
  setDefaultContext,
  resetDefaultContext,
  type ExecutionContext,
  type EngineHooks,
  type CleanupRegistrar,
} from "./reactivity/context";

export {
  DIRTY_STATE,
  PRODUCER_INITIAL_STATE,
  PRODUCER_CHANGED,
  PRODUCER_DIRTY,
  CONSUMER_INITIAL_STATE,
  CONSUMER_CHANGED,
  CONSUMER_DIRTY,
  WATCHER_INITIAL_STATE,
  WATCHER_CHANGED,
  WALKER_STATE,
  ReactiveNode,
  ReactiveNodeState,
  isDisposedNode,
  disposeNode,
  disposeNodeEvent,
} from "./reactivity";

```

Two clarifications matter:

1. `runWatcher()` executes a watcher node and returns `void`.
   It does not create a watcher for you and it does not return a disposer.
2. `writeProducer()` accepts `compare` before `context`:
   `writeProducer(node, value, compare?, context?)`.

## Core Node Model

The runtime is built around `ReactiveNode`.

```ts
new ReactiveNode(payload, compute, state)
```

The three node roles are:

### Producer

Mutable source state.

- stores committed payload directly
- never recomputes
- invalidates subscribers on write

```ts
const count = new ReactiveNode(0, null, PRODUCER_INITIAL_STATE);
```

### Consumer

Pure derived value.

- computes lazily
- caches its last payload
- tracks dependencies while its `compute` function runs
- recomputes only when stabilized through `readConsumer()`

```ts
const doubled = new ReactiveNode<number | undefined>(
  undefined,
  () => readProducer(count) * 2,
  CONSUMER_INITIAL_STATE,
);
```

### Watcher

Effect-like sink.

- does not produce a value for downstream reads
- runs only when the host calls `runWatcher()`
- may return a cleanup function
- is invalidated by propagation and surfaced through hooks

```ts
const watcher = new ReactiveNode<unknown>(
  null,
  () => {
    console.log(readConsumer(doubled));
    return () => console.log("cleanup");
  },
  WATCHER_INITIAL_STATE,
);
```

### Initial State Constants

The initial-state helpers are intentionally asymmetric:

- `PRODUCER_INITIAL_STATE` is clean
- `CONSUMER_INITIAL_STATE` is currently an alias of `CONSUMER_CHANGED`
- `WATCHER_INITIAL_STATE` is currently an alias of `WATCHER_CHANGED`

That means a fresh consumer or watcher is considered dirty on purpose, so the
first `readConsumer()` or `runWatcher()` performs an initial execution.

## Execution Contexts

Every public operation accepts an optional `ExecutionContext` as its last
parameter.

```ts
readProducer(node, context?)
readConsumer(node, mode?, context?)
writeProducer(node, value, compare?, context?)
runWatcher(node, context?)
untracked(fn, context?)
```

An execution context owns:

- `activeComputed`
- propagation bookkeeping
- watcher cleanup registration
- host hooks

It does not own the nodes themselves. Nodes keep their edges and payload on the
node object, not in the context.

### Context Helpers

```ts
const ctx = createExecutionContext({
  onEffectInvalidated(node) {
    queue.push(node);
  },
  onReactiveSettled() {
    // host-level "graph is idle" callback
  },
});

setDefaultContext(ctx);
const sameCtx = getDefaultContext();
resetDefaultContext();
```

### Hook Semantics

`EngineHooks` currently supports:

```ts
interface EngineHooks {
  onEffectInvalidated?(node: ReactiveNode): void;
  onReactiveSettled?(): void;
}
```

`onEffectInvalidated`

- fires synchronously during propagation when a watcher becomes dirty
- does not run the watcher for you
- is where a host scheduler usually queues watcher nodes

`onReactiveSettled`

- fires when the context reaches a quiescent point
- requires `propagationDepth === 0`
- requires `activeComputed === null`
- can fire after reads, recomputes, or propagation waves

### Practical Rule

Use one context per reactive "world" unless you intentionally want multiple
host policies touching the same graph. Contexts isolate scheduling hooks and
bookkeeping, not node ownership.

## Public Operation Semantics

### `readProducer(node, context?)`

Returns `node.payload` immediately.

If a computation is currently active in `context`, the read is tracked as a
dependency edge from the producer to that active consumer or watcher.

It does not stabilize anything and it never executes user code.

### `writeProducer(node, value, compare?, context?)`

Commits new producer state eagerly.

The current implementation:

1. compares `previous` and `value` with `compare` (`Object.is` by default)
2. returns early if they are considered equal
3. assigns `node.payload = value`
4. synchronously propagates invalidation to reachable subscribers

Important consequences:

- producer writes are immediate
- propagation is synchronous
- no consumer compute function runs during `writeProducer()`
- no watcher compute function runs during `writeProducer()`
- watcher hooks may run during propagation

Direct subscribers are marked `Changed`. Deeper descendants are generally marked
`Invalid`, which means "maybe stale, verify later".

### `readConsumer(node, mode?, context?)`

Returns a stable consumer value.

Before returning, the runtime stabilizes the consumer:

- if the node is clean, it returns the cached payload
- if the node is `Changed`, it recomputes immediately
- if the node is `Invalid`, it verifies whether upstream changes actually affect
  this node before deciding to recompute

Read modes:

```ts
enum ConsumerReadMode {
  lazy = 1 << 0,
  eager = 1 << 1,
}
```

`lazy`

- default mode
- stabilizes the node
- then registers the consumer itself as a dependency of the active outer
  computation, if one exists

`eager`

- stabilizes the node
- does not subscribe the active outer computation to this consumer
- useful for probing or prewarming a derived value without creating a dependency

### `runWatcher(node, context?)`

Executes a watcher node if it is dirty.

Behavior:

- disposed watcher: no-op
- clean watcher: no-op
- dirty watcher with no real upstream change: clears dirtiness and returns
- dirty watcher with real change:
  - runs previous cleanup, if any
  - clears dirty state
  - executes the watcher compute function
  - stores a returned function as the next cleanup

`runWatcher()` returns `void`.

This is intentional: watcher scheduling belongs to the host. The runtime only
marks watchers dirty and surfaces invalidation through `onEffectInvalidated`.

### `disposeWatcher(node)`

Disposes the watcher node and runs its last cleanup function once.

It is safe to call more than once. After disposal:

- the node is marked `Disposed`
- incoming and outgoing edges are unlinked
- `compute` is cleared
- payload is reset after cleanup handling

### `disposeNode(node)` and `disposeNodeEvent(node)`

`disposeNode()` is the generic low-level disposal primitive for any node kind.

`disposeNodeEvent()` is currently just an alias of `disposeNode()`.

Disposed nodes are terminal:

- they do not participate in tracking
- they do not participate in propagation
- they do not recompute
- reads return the last cached payload instead of rejoining the graph

### `untracked(fn, context?)`

Runs `fn` with `context.activeComputed` temporarily cleared.

Reads performed inside `fn` do not create dependency edges to the outer active
computation.

## Dirty-State Model

The important state bits are:

```ts
enum ReactiveNodeState {
  Producer,
  Consumer,
  Watcher,
  Invalid,
  Changed,
  Visited,
  Disposed,
  Computing,
  Scheduled,
  Tracking,
}
```

In normal public flows:

- `Changed` means "a direct upstream dependency definitely changed"
- `Invalid` means "something upstream may have changed; verify on pull"
- `Disposed` is terminal
- `Computing` and `Tracking` are transient execution flags
- `Visited` is a transient re-entrancy marker used by the internal walkers

`DIRTY_STATE` is `Invalid | Changed`.

### Important Clarification About Exported Constants

Some exported constants are mainly useful for tests and low-level tooling:

- `PRODUCER_CHANGED`
- `PRODUCER_DIRTY`
- `CONSUMER_DIRTY`
- `WATCHER_CHANGED`
- `WALKER_STATE`

They should not be read as "all of these are normal steady-state values".

Example: a producer write normally commits the payload and leaves the producer
clean; producers do not stay dirty in standard write flow.

Also note:

- `ReactiveNodeState.Scheduled` exists in the enum
- the current core runtime does not actively manage that bit in public flow

## Internal Mechanics You Can Rely On

The runtime is implemented as a bidirectional graph of linked edges.

Each node keeps:

- incoming edges through `firstIn` / `lastIn`
- outgoing edges through `firstOut` / `lastOut`
- a dependency reuse cursor in `depsTail`

The stable, observable consequences are:

### 1. Push invalidation and pull recomputation are separate

Writes push dirtiness through the graph immediately.
Reads and watcher runs pull the graph back to a stable value when needed.

This means:

- writes are cheap relative to full recomputation
- unread consumers stay lazy
- watcher execution policy stays host-controlled

### 2. Dynamic dependencies are pruned after recompute

If a consumer stops reading one branch and starts reading another, stale edges
are removed after that recompute pass.

Later writes from the abandoned branch no longer invalidate the consumer.

### 3. Edge consistency matters

Every dependency edge exists in both directions:

- source -> subscriber
- subscriber -> source

If you work against internal graph helpers, both views must stay in sync.

### 4. Disposal eagerly detaches the graph

Disposing an intermediate node removes it from its sources and detaches its own
subscribers. Downstream nodes stop receiving future invalidation through that
path immediately.

## Minimal End-to-End Example

```ts
import {
  ConsumerReadMode,
  CONSUMER_INITIAL_STATE,
  PRODUCER_INITIAL_STATE,
  ReactiveNode,
  WATCHER_INITIAL_STATE,
  createExecutionContext,
  readConsumer,
  readProducer,
  runWatcher,
  writeProducer,
} from "@reflex/runtime";

const pending: ReactiveNode[] = [];

const ctx = createExecutionContext({
  onEffectInvalidated(node) {
    if (!pending.includes(node)) {
      pending.push(node);
    }
  },
});

const left = new ReactiveNode(1, null, PRODUCER_INITIAL_STATE);
const right = new ReactiveNode(2, null, PRODUCER_INITIAL_STATE);

const sum = new ReactiveNode<number | undefined>(
  undefined,
  () => readProducer(left, ctx) + readProducer(right, ctx),
  CONSUMER_INITIAL_STATE,
);

const watcher = new ReactiveNode<unknown>(
  null,
  () => {
    console.log(readConsumer(sum, ConsumerReadMode.lazy, ctx));
  },
  WATCHER_INITIAL_STATE,
);

runWatcher(watcher, ctx);
writeProducer(left, 10, Object.is, ctx);

while (pending.length > 0) {
  runWatcher(pending.shift()!, ctx);
}
```

What happens here:

1. the first `runWatcher()` establishes dependencies
2. `writeProducer(left, 10, ...)` updates the producer immediately
3. the watcher is invalidated synchronously through the hook
4. the host decides when to drain `pending`
5. `runWatcher()` performs cleanup-if-needed and re-executes the effect

## Debug API: `@reflex/runtime/debug`

`subtle` is a small introspection surface exported from `@reflex/runtime/debug`.

Useful methods include:

- `subtle.enabled`
- `subtle.label(node, label)`
- `subtle.snapshot(node)`
- `subtle.context(context?)`
- `subtle.history(context?)`
- `subtle.observe(listener, context?)`
- `subtle.clearHistory(context?)`
- `subtle.configure(options?, context?)`

Important limitation:

- in production builds, `subtle` becomes a no-op or returns empty/undefined data

Treat it as a debugging aid, not as part of the runtime's core reactive
contract.

## Summary

The runtime guarantees the following high-level model:

- producers commit eagerly on write
- consumers recompute lazily on stabilization
- watchers are invalidated by the runtime but executed by the host
- contexts carry hooks and bookkeeping, not graph ownership
- stale dynamic dependencies are removed after recompute
- disposal is terminal and eagerly detaches graph edges

If you need more than this, the next layer of detail lives in
[`src/reactivity/walkers/README.md`](./src/reactivity/walkers/README.md) and
the notes under [`study/`](./study/).
