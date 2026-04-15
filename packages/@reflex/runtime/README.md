---
description: |
  Low-level reactive graph engine for deterministic, host-controlled execution.
  See DOC-TOPOLOGY.md for documentation structure and reading paths.
---

# Reflex Runtime

`@reflex/runtime` is a minimal reactive graph engine optimized for selective, on-demand recomputation.

Instead of a global execution order, it stabilizes only the accessed subgraph using a walk-based algorithm:

- **Push phase:** cheap invalidation via `propagate()`
- **Pull phase:** lazy stabilization via `readConsumer()`
- **No built-in scheduler:** execution is host-controlled

This is a **low-level computation substrate**, not a UI framework or convenience library.

---

## Mental Model

Think of three node kinds:

- **Producer:** mutable source (like a cell in a spreadsheet)
- **Consumer:** pure derived computation (like a formula)
- **Watcher:** side effect sink (like an observer or logger)

The runtime maintains a dependency graph and propagates changes deterministically. Your host code controls when computation happens.

---

## Minimal Example

```ts
import { ReactiveNode, readProducer, writeProducer, readConsumer, runWatcher } from "@reflex/runtime";
import { PRODUCER_INITIAL_STATE, CONSUMER_INITIAL_STATE, WATCHER_INITIAL_STATE } from "@reflex/runtime";

// 1. Producer: mutable source
const count = new ReactiveNode(0, null, PRODUCER_INITIAL_STATE);

// 2. Consumer: pure computation, tracks dependencies
const doubled = new ReactiveNode(undefined, () => {
  const c = readProducer(count);
  return c * 2;
}, CONSUMER_INITIAL_STATE);

// 3. Watcher: effect sink, runs on demand
const effect = new ReactiveNode(null, () => {
  const d = readConsumer(doubled);
  console.log("doubled is now:", d);
  return () => console.log("effect cleanup");
}, WATCHER_INITIAL_STATE);

// Mutation: push invalidation
writeProducer(count, 5);

// Host decides when to compute: pull stabilization
readConsumer(doubled);  // recomputes doubled if invalid
runWatcher(effect);     // executes effect
```

### What Happens

1. `writeProducer(count, 5)` marks subscribers invalid (cheap push)
2. `readConsumer(doubled)` checks if `doubled` is dirty, recomputes only if needed (pull)
3. `runWatcher(effect)` executes the effect function and stores cleanup
4. Next mutation only invalidates, never auto-executes

---

## Core Roles

### Producer

- Holds mutable state
- Never computes
- Invalidates dependents on write
- Example: signal, mutable store

### Consumer

- Pure function with dependencies
- Computes lazily on read
- Caches result
- Example: derived value, computed property

### Watcher

- Effect-like node
- Executes only when host calls `runWatcher()`
- Can return cleanup function
- Example: logger, side-effect handler, subscriber

---

## Host Responsibilities

This runtime does **not** provide:

- `flush()` or automatic batching
- Built-in scheduler
- Microtask management
- Frame-driven execution

Instead, your host code:

1. Calls `writeProducer()` to mutate
2. Decides when to call `readConsumer()` (lazy pull)
3. Decides when to call `runWatcher()` (effect scheduling)
4. Owns the execution context and hooks

Example host scheduler:

```ts
const ctx = createExecutionContext({
  onEffectInvalidated(node) {
    pendingWatchers.push(node);
  },
});

// Somewhere in your event loop:
while (pendingWatchers.length) {
  runWatcher(pendingWatchers.shift(), ctx);
}
```

---

## Key Properties

- **Lazy:** computation only on demand
- **Explicit:** no hidden scheduling or automatic execution
- **Composable:** clear separation of concerns
- **Observable:** dirty states and tracking are exposed
- **Deterministic:** no implicit ordering or randomness

---

## Documentation Map

- **[RUNTIME.md](./RUNTIME.md)** — precise public contract, state constants, invariants
- **[DISPOSE.md](./DISPOSE.md)** — disposal and cleanup semantics
- **[DOC-TOPOLOGY.md](./DOC-TOPOLOGY.md)** — doc structure and reading paths
- **[study/](./study/)** — deep dives for maintainers (start with [study/README.md](./study/README.md))
- **[src/reactivity/walkers/README.md](./src/reactivity/walkers/README.md)** — algorithm reference

---

## Use When

- Building a reactive framework
- You need deterministic, host-controlled execution
- Full control over scheduling is required
- Reactive computation outside UI contexts

---

## Do Not Use When

- You want automatic, implicit scheduling
- You need batteries-included convenience
- Local component state is your only concern
- Framework-specific integration is unimportant
