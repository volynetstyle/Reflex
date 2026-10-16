# Reflex Runtime

`@volynets/reflex-runtime` is a low-level reactive graph engine for
deterministic, host-controlled execution: the primitives for building reactive
systems, schedulers, frameworks, state containers and computation graphs.

Reflex separates dependency tracking, graph propagation, computation,
side-effect execution and scheduling. **The runtime owns graph semantics. The
host owns execution policy.**

The exact contract is [docs/RUNTIME.md](./docs/RUNTIME.md); all documentation
is indexed in the [documentation map](./docs/README.md). Branch switching,
read-tracking routes and dynamic topology across packages are described in the
[dynamic dependencies guide](../../docs/dynamic-dependencies/README.md).

## Installation

```bash
pnpm add @volynets/reflex-runtime
```

## Core concepts

- **Producer** (`createProducer`): a mutable source value, such as a signal,
  store or mutable state.
- **Consumer** (`createConsumer`, read with `readConsumer`): a derived
  computation that tracks its dependencies automatically, caches its result and
  recomputes lazily when read.
- **Watcher** (`createWatcher`, run with `runWatcher`, disposed with
  `disposeWatcher`): a side-effect sink. It never takes part in value
  propagation, executes only when the host runs it, and may return a cleanup
  function.

Lifetime: a consumer stays linked to its sources until it is disposed, even
when nothing observes it and the application has dropped its handle. Its
sources keep it reachable, so a forgotten consumer is retained rather than
garbage-collected. Release raw consumers with `disposeNode` from
`@volynets/reflex-runtime/internal`, or create them under an owner that does it
(see [Dependency retention](./docs/RUNTIME.md#dependency-retention)).

## Minimal example

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
const doubled = createConsumer(() => readProducer(count) * 2);
const effect = createWatcher(() => {
  console.log("doubled =", readConsumer(doubled));
});

writeProducer(count, 5);
console.log(readConsumer(doubled)); // 10
runWatcher(effect);
```

## Execution model

Reflex is push-pull. A write (`writeProducer`) cheaply invalidates the
affected region; nothing recomputes during propagation. A read
(`readConsumer`) stabilizes lazily and recomputes only what is necessary.
Watchers execute only when the host decides (`runWatcher`); Reflex never
schedules implicitly.

## Host-controlled scheduling

Reflex does not provide automatic effect flushing, microtask queues, frame
schedulers, async orchestration or rendering integration. The host decides when
to mutate, read and execute watchers, and how invalidated sinks are scheduled.

The runtime hooks have two distinct contracts:

- `onNodeInvalidated` runs during propagation and is **enqueue-only**: it must
  not execute watchers or access reactive graph state.
- `onRuntimeIdle` runs at an idle host boundary after propagation, pull and
  watcher work have settled. It may synchronously drain queued watchers, which
  is how an eager scheduler delivers effects without a microtask hop. If a
  watcher creates more work, Reflex delivers another settled checkpoint once
  the runtime is idle again.

A watcher invalidated while it runs is handed to `onNodeInvalidated` again, so
a host queue never loses work. Nested hook calls are supported; if a hook
throws, Reflex restores its propagation bookkeeping before rethrowing, so a
subsequent write starts a fresh walk.

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
    onNodeInvalidated(watcher) {
      pendingWatchers.add(watcher); // enqueue only
    },
    onRuntimeIdle() {
      flushWatchers(); // or scheduleFlush(), requestAnimationFrame(...), host.schedule(...)
    },
  },
});
```

Inside `onNodeInvalidated`, `readConsumer`, `readProducer`, `writeProducer` and
`disposeWatcher` are forbidden. Development validation builds report a broken
contract where it happens, for example:

```txt
[REFLEX_SCHEDULER_REENTRANT_FLUSH]
Host scheduler executed runWatcher() synchronously from onNodeInvalidated.
```

Other policy errors: `REFLEX_SCHEDULER_REACTIVE_READ_IN_HOOK`,
`REFLEX_NESTED_PULL`, `REFLEX_NESTED_PROPAGATION`,
`REFLEX_HOST_HOOK_REENTERED_RUNTIME`. The full scheduler contract is in
[docs/runtime/scheduler-contract.md](../../docs/runtime/scheduler-contract.md).

## Execution domains

Several independent reactive applications can share one kernel. Each
**execution domain** owns a register bank, host hooks, one scheduler and a
managed entry depth; nodes are not tagged with a domain.

```ts
import {
  createExecutionDomain,
  createProducer,
  createWatcher,
  readProducer,
  runWatcher,
  writeProducer,
} from "@volynets/reflex-runtime";

const queue = [];
const app = createExecutionDomain({
  scheduler: {
    onNodeInvalidated: (node) => queue.push(node), // enqueue only
    flush: () => {
      while (queue.length) runWatcher(queue.shift());
    },
  },
});

const count = app.run(() => createProducer(0));
app.run(() =>
  runWatcher(createWatcher(() => console.log(readProducer(count)))),
);

app.batch(() => writeProducer(count, 1));
app.flush(); // runs inside `app`, using only `app`'s queue
app.close(); // logical close now, teardown at the next safe point
```

| Surface                                                                                                                                                                          | Use for                                   | Guarantees                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Managed**: `createExecutionDomain`, `domain.run/batch/flush/teardown/close`, `createSchedulerDomain` (scheduler), `runManaged`, `bindManaged`, `createOwnedSignal` (framework) | Independent apps, SSR requests, renderers | Per-domain scheduling, register/phase isolation, safe-point teardown, async completion authority     |
| **Raw**: `createProducer`, `readProducer`, `writeProducer`, `runWatcher`, `runWithRuntimeContext`, …                                                                             | Trusted low-level code                    | Operate under the _active_ context; reading or writing another domain's nodes from here is unchecked |

- `domain.run(fn)` enters the domain; a nested entry into the already active
  domain does not reload registers.
- Raw writes are attributed to the active domain. Write another domain's nodes
  through that domain's entry point.
- Values cross domains only explicitly: an untracked snapshot read, or a port
  (`reflex-framework`), never a reactive edge.
- `domain.teardown(fn)` runs graph teardown now at depth zero, otherwise at the
  outermost managed exit.
- Domains are not a security boundary. See
  [execution domains](../../docs/architecture/execution-domains.md).

## Reads without tracking and read modes

`untracked(() => readProducer(source))` reads without registering a dependency
(diagnostics, logging, metadata). `readConsumer` is the default read;
`readConsumerLazy` and `readConsumerEager` select the lazy (register the final
edge) and eager (stabilize without registering it) modes explicitly.

## Debugging and internal APIs

`@volynets/reflex-runtime/debug` exposes a versioned debugging protocol, graph
inspection and read-only diagnostics, separated from the production runtime;
see [docs/DIAGNOSTICS.md](./docs/DIAGNOSTICS.md).

`@volynets/reflex-runtime/internal` exposes graph primitives, state constants
and scheduler integration for framework authors and runtime experiments. It is
not covered by public stability guarantees.

## When to use it

Use Reflex to build a reactive framework, a scheduler or a state container, to
research reactive execution models, or when you need explicit control over
computation timing. Do not use it if you want automatic effect scheduling, a UI
framework, batteries-included state management or implicit execution.

## Status

Experimental. The runtime core is considered usable; diagnostics, tooling and
higher-level framework layers continue to evolve.
