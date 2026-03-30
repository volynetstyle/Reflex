# Reactive Runtime

A low-level runtime for building deterministic reactive systems.

This project provides a minimal reactive execution engine based on explicit node kinds and host-controlled scheduling. It is designed as a **general-purpose computation substrate**, not a UI framework.

---

## Table of Contents

- Philosophy
- Architecture
- Node Model
- Execution Model
- Example
- Scheduler
- Invariants
- Disposal Protocol
- How It Differs From Typical Signals Libraries
- When To Use
- When Not To Use

---

# Philosophy

Reactive systems contain unavoidable global complexity:

- dependency ordering
- invalidation semantics
- lifecycle management
- ownership boundaries
- scheduling policy

Hiding this behind a “complete” API does not remove complexity — it relocates it.

This runtime keeps complexity explicit, minimal, and composable.

---

# Architecture

The system is divided into:

1. **Core runtime** (this package)
2. **Scheduler layer** (external)
3. **Optional wrapper APIs** (signals-style interfaces)

The core handles:

- Dependency graph construction
- Change invalidation
- Deterministic propagation
- Lifecycle boundaries

The core does not handle:

- Frame batching
- Async scheduling
- Priority queues
- Rendering semantics

These are host responsibilities.

---

# Node Model

Reactive behavior is built from explicit node kinds.

## Producer

Source of mutation.

- Holds mutable state
- Can invalidate dependents
- Does not execute computation

## Consumer

Pure derived computation.

- Tracks dependencies during execution
- Recomputes when invalidated
- Holds cached derived value

## Recycler

Lifecycle + effect boundary.

- Observes reactive reads
- Executes side-effects
- Registers cleanup logic
- May dynamically change dependencies

---

## Node Role Summary

| Kind     | Holds State  | Executes Code | Owns Cleanup | Causes Invalidation |
| -------- | ------------ | ------------- | ------------ | ------------------- |
| Producer | ✔           | ✖            | ✖           | ✔                  |
| Consumer | ✔ (derived) | ✔            | ✖           | ✖                  |
| Recycler | ✖           | ✔            | ✔           | ✖                  |

---

# Execution Model

The runtime is **host-driven**.

Mutation does not trigger execution.

Execution occurs only when the host calls:

```ts
flush();
```

This ensures:

- Scheduler agnosticism
- Deterministic execution
- Explicit control over propagation timing

---

# Example

```ts
// Source of change
const a = new ReactiveNode(Kind.Producer);

// Derived computation
const b = new ReactiveNode(Kind.Consumer, () => readProducer(a) * 2);

// Mutate
writeProducer(a, 2);

// Execute propagation
flush();

console.log(readConsumer(b)); // 4
```

### What Happens

1. `writeProducer` marks dependents dirty.
2. No computation runs immediately.
3. `flush()` performs propagation.
4. `b` recomputes once.
5. `readConsumer` returns stable value.

---

## Debug Introspection Example

Run:

```bash
pnpm --filter @reflex/runtime example:introspection
```

The script uses `@reflex/runtime/debug` and prints:

- execution phases
- invalidation / recompute events
- graph snapshots for key nodes
- current queue and context state

---

## Recycler Example

```ts
const e = new ReactiveNode(Kind.Recycler, () => {
  console.log(`a = ${readProducer(a)}, b = ${readConsumer(b)}`);

  return () => {
    // cleanup logic
  };
});

const cleanup = recycling(e);
```

Recycler nodes:

- Execute effects
- Track reactive reads
- Run cleanup before next execution
- May alter graph topology dynamically

---

# Scheduler

This runtime intentionally does not embed a scheduler.

Different domains require different policies:

| Domain     | Scheduling Strategy |
| ---------- | ------------------- |
| UI         | Frame batching      |
| SSR        | Synchronous flush   |
| Workers    | Message-driven      |
| Simulation | Tick-based          |
| Streaming  | Backpressure-aware  |

A built-in scheduler would impose assumptions and reduce generality.

Instead, the runtime exposes minimal hooks to integrate any execution strategy.

---

# Invariants

If these invariants hold, they should be documented clearly:

- A consumer executes at most once per flush cycle.
- A producer mutation never triggers immediate execution.
- Propagation order is topologically consistent.
- Cleanup runs before next execution of the same recycler.
- Derived values are stable between flush cycles.

The disposal-specific contract is documented separately in
[`DISPOSAL_PROTOCOL.md`](./DISPOSAL_PROTOCOL.md).

These invariants define the semantic contract of the runtime.

---

# How It Differs From Typical Signals Libraries

Most signals libraries provide:

- Implicit scheduling
- Implicit batching
- UI-oriented execution model
- Unified API surface
- Hidden lifecycle boundaries

This runtime differs fundamentally.

## 1. No Hidden Scheduler

Typical libraries trigger execution automatically after mutation.

This runtime separates:

- Mutation
- Invalidation
- Execution

Execution is always host-controlled.

---

## 2. Explicit Node Kinds

Signals libraries often blur:

- Derived computation
- Effects
- State

Here they are structurally distinct:

- Producer
- Consumer
- Recycler

This prevents semantic ambiguity.

---

## 3. Scheduler-Agnostic by Design

Signals libraries encode assumptions about:

- Rendering frames
- Microtasks
- Async batching

This runtime encodes none of these.

It can power:

- UI frameworks
- Deterministic engines
- Simulation systems
- Server computation pipelines

---

## 4. No Opinionated API Layer

Signals libraries expose a unified ergonomic API.

This runtime exposes primitives.

Wrappers are optional and replaceable.

---

## 5. Lifecycle as First-Class Concern

Recycler nodes explicitly model:

- Effect execution
- Cleanup semantics
- Resource ownership

Most libraries treat lifecycle implicitly.

---

## 6. Graph Topology Is Dynamic

This runtime allows:

- Dynamic dependency creation
- Dependency recycling
- Graph segment replacement

Without requiring framework-level abstractions.

---

# When To Use

Use this runtime if:

- You are building a reactive framework
- You need deterministic execution
- You require full control over scheduling
- You want to experiment with execution models
- You need reactive computation outside UI

---

# When Not To Use

Do not use this if:

- You only need local component state
- You want batteries-included convenience
- You do not plan to control scheduling
- You expect automatic batching

---

# Mental Model

Think of this as:

> A deterministic dependency graph engine.

Not:

> A convenience signals library.
