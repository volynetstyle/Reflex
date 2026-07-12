# Reflex Runtime

`@volynets/reflex-runtime` is a low-level reactive graph engine for deterministic, host-controlled execution.

It provides the primitive building blocks required to construct reactive systems, schedulers, frameworks, state containers, and computation graphs.

Unlike most reactive libraries, Reflex separates:

- dependency tracking,
- graph propagation,
- computation,
- side-effect execution,
- scheduling.

The runtime owns graph semantics. The host owns execution policy.

---

## Installation

```bash
pnpm add @volynets/reflex-runtime
```

---

## Core Concepts

Reflex is built around three fundamental roles:

### Producer

A mutable source value.

Examples:

- signals
- stores
- mutable state

Created with:

```ts
createProducer(...)
```

---

### Consumer

A derived computation.

Consumers:

- track dependencies automatically,
- cache results,
- recompute lazily,
- participate in graph stabilization.

Created with:

```ts
createConsumer(...)
```

Read with:

```ts
readConsumer(...)
```

---

### Watcher

A side-effect sink.

Watchers:

- never participate in value propagation,
- execute only when explicitly scheduled,
- may return cleanup functions.

Created with:

```ts
createWatcher(...)
```

Executed with:

```ts
runWatcher(...)
```

Disposed with:

```ts
disposeWatcher(...)
```

---

## Minimal Example

```ts
import {
  createProducer,
  createConsumer,
  createWatcher,
  readProducer,
  writeProducer,
  readConsumer,
  runWatcher,
} from "@volynets/reflex-runtime";

const count = createProducer(0);

const doubled = createConsumer(() => {
  return readProducer(count) * 2;
});

const effect = createWatcher(() => {
  console.log("doubled =", readConsumer(doubled));
});

writeProducer(count, 5);

console.log(readConsumer(doubled));

runWatcher(effect);
```

---

## Execution Model

Reflex uses a push-pull architecture.

### Push

Writes invalidate affected graph regions.

```ts
writeProducer(count, 5);
```

Invalidation is intentionally cheap.

No recomputation happens during propagation.

---

### Pull

Consumers stabilize lazily when read.

```ts
readConsumer(doubled);
```

Only the necessary portion of the graph is recomputed.

---

### Watchers

Watchers execute only when the host decides.

```ts
runWatcher(effect);
```

Reflex never performs implicit scheduling.

---

## Host-Controlled Scheduling

Reflex intentionally does not provide:

- automatic effect flushing,
- microtask queues,
- frame schedulers,
- async orchestration,
- rendering integration.

The host decides:

- when to mutate,
- when to read,
- when to execute watchers,
- how invalidated sinks should be scheduled.

Runtime hooks have two distinct contracts:

- `sinkInvalidatedDispatcher` runs during propagation. It is enqueue-only: it
  must not execute watchers or access reactive graph state.
- `reactiveSettledDispatcher` runs at an idle host boundary after propagation,
  pull, and watcher work have settled. It may synchronously drain queued
  watchers, which is how an eager scheduler delivers effects without a
  microtask hop.

Nested runtime hook calls are supported. The runtime restores the outer hook's
validation context when an inner hook returns.

Recommended scheduler shape:

```ts
import {
  configureRuntimeContext,
  runWatcher,
} from "@volynets/reflex-runtime/internal";

const pendingWatchers = new Set();
let flushScheduled = false;
let flushing = false;

function flushWatchers() {
  if (flushing || pendingWatchers.size === 0) return;

  flushScheduled = false;
  flushing = true;
  try {
    for (const watcher of pendingWatchers) {
      pendingWatchers.delete(watcher);
      runWatcher(watcher);
    }
  } finally {
    flushing = false;
  }
}

function scheduleFlush() {
  if (flushScheduled) return;

  flushScheduled = true;
  queueMicrotask(flushWatchers);
}

configureRuntimeContext({
  hooks: {
    sinkInvalidatedDispatcher(watcher) {
      pendingWatchers.add(watcher);
    },
    reactiveSettledDispatcher() {
      flushWatchers();
    },
  },
});

// Optional explicit host boundary.
flushWatchers();
```

Allowed inside `sinkInvalidatedDispatcher`:

```ts
queue.add(watcher);
```

Allowed inside `reactiveSettledDispatcher`:

```ts
flushWatchers();
```

```ts
queueMicrotask(flushWatchers);
requestAnimationFrame(flushWatchers);
host.schedule(flushWatchers);
```

Forbidden inside `sinkInvalidatedDispatcher`:

```ts
readConsumer(node);
readProducer(node);
writeProducer(node, value);
```

`reactiveSettledDispatcher` may run a synchronous watcher/effect drain. A
watcher can in turn read or write reactive state; if that creates more work,
Reflex delivers another settled checkpoint once the runtime is idle again.

If a host hook throws, Reflex restores its propagation bookkeeping before
rethrowing the original error. A subsequent write can therefore start a fresh
propagation walk.

In development validation builds, Reflex reports scheduler contract violations
at the boundary where they happen:

```txt
[REFLEX_SCHEDULER_REENTRANT_FLUSH]

Host scheduler executed runWatcher() synchronously from sinkInvalidatedDispatcher.
```

Other scheduler policy errors include:

```txt
REFLEX_SCHEDULER_REACTIVE_READ_IN_HOOK
REFLEX_NESTED_PULL
REFLEX_NESTED_PROPAGATION
REFLEX_HOST_HOOK_REENTERED_RUNTIME
```

See also:

```text
docs/runtime/scheduler-contract.md
```

---

## Untracked Reads

Reads may be performed without dependency registration.

```ts
untracked(() => {
  return readProducer(source);
});
```

Useful for:

- diagnostics,
- logging,
- debugging,
- metadata access.

---

## Consumer Read Modes

Reflex exposes multiple read strategies.

```ts
readConsumer(...)
readConsumerLazy(...)
readConsumerEager(...)
```

Use the mode that best matches your execution model.

Most applications should start with:

```ts
readConsumer(...)
```

---

## Debugging

Development tooling is available through:

```ts
import "@volynets/reflex-runtime/debug";
```

The runtime exposes a versioned debugging protocol suitable for:

- graph inspection,
- runtime diagnostics,
- visualization tooling,
- developer extensions.

Debug APIs are intentionally separated from the production runtime.

---

## Internal APIs

Internal graph primitives are available through:

```ts
import "@volynets/reflex-runtime/internal";
```

These APIs are intended for framework authors and runtime experiments.

They are not covered by public stability guarantees.

---

## Key Properties

- Deterministic graph propagation
- Lazy recomputation
- Explicit execution
- Host-controlled scheduling
- Dynamic dependency tracking
- Minimal runtime surface
- Framework-agnostic design

---

## Use When

- Building a reactive framework
- Building a scheduler
- Building a state container
- Researching reactive execution models
- You need explicit control over computation timing

---

## Do Not Use When

- You want automatic effect scheduling
- You want a UI framework
- You need batteries-included state management
- You prefer implicit execution semantics

---

## Package Structure

```text
@volynets/reflex-runtime
├─ runtime primitives
├─ graph propagation
├─ dependency tracking
├─ watcher execution
└─ scheduling hooks

@volynets/reflex-runtime/debug
└─ debugging protocol

@volynets/reflex-runtime/internal
└─ unstable internal APIs
```

---

## Status

Experimental.

The runtime core is considered usable.

Diagnostics, tooling, and higher-level framework layers continue to evolve.
