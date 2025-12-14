<div style="background:linear-gradient(145deg,#0F0F0F,#1A1A1A);padding:40px;border-radius:12px;">

<p align="center" style="background:linear-gradient(145deg,#0F0F0F,#1A1A1A);padding:40px 0;border-radius:12px;">
  <img src="./assets/reflex-dragon-gold.png" width="220" alt="Reflex Logo" style="border-radius:50%;box-shadow:0 0 30px rgba(198,166,86,0.3)"/>
</p>

<h1 align="center" style="color:#C6A656;">Reflex</h1>
<p align="center" style="color:#C0B68A;"><em>Universal Reactive Runtime</em></p>
<p align="center" style="color:#A8452E;"><strong>“One contract. One core. Any surface.”</strong></p>

---

## What Reflex Actually Is

**Reflex is not a UI framework.**

Reflex is a **deterministic reactive computation engine** with ownership semantics, epoch-based time, and intrusive graph topology.

It can drive:

- UI frameworks (DOM / Canvas / WebGL / Native)
- Simulation engines
- Reactive servers
- Dataflow pipelines
- Distributed systems
- Game engines
- Orchestration layers

UI is just one possible **surface adapter** — not the core identity.

---

## Architecture

### `@reflex/contract`

Pure mathematical definitions. No logic. No runtime.

Defines the **invariants** of the system:

- `NodeKind`, `LifeState`, `Epoch`, `OwnerId`
- `INode`, `ITemporalNode`, `IOwner`
- `IScheduler`, `IAllocator`
- Reactive graph contracts

This layer is **frozen by design**. It defines what reality means in Reflex.

### `@reflex/core`

The actual engine:

- Ownership model (Owner Tree)
- Reactive DAG (signals → memos → effects)
- Epoch system (deterministic local time)
- Intrusive graph links (no adjacency arrays)
- Allocation strategies / pooling
- Dirty propagation
- Disposal algorithms
- Context prototype chain
- Event validation (epoch + version + life state)

**No DOM. No JSX. No rendering. No browser assumptions.**

Pure logic.

### `@reflex/runtime`

Surface implementations:

- DOM adapter
- Scheduler bindings
- Async bridges
- Server integration
- Worker / thread bridges
- Experimental modules

Uses **only contracts + core**. Swappable. Extensible.

---

## Core Model

Reflex operates on **4 fundamental invariants**:

1. **Ownership is the unit of life** — nothing exists without an owner
2. **Reactivity is a DAG, not a tree** — real topological ordering
3. **Time is local (Epochs), not global** — deterministic causality
4. **Nothing exists without a context** — no ambient globals

When an owner dies → everything dies safely. No zombies. No leaks. No magical GC.

---

## Ownership Model

```
Root Owner
└─ App Owner
   ├─ Graph Owner
   │  ├─ Signal A
   │  ├─ Computation B
   │  └─ Effect C
   └─ Feature Owner
      └─ Async Effect
```

Every reactive node (signal, memo, effect, async callback) has an owner.

Child owners inherit:

- Context
- Scheduling
- Lifetime guarantees

`dispose(owner)` guarantees **deterministic cleanup** of the entire subgraph.

---

## Reactive Graph — Real DAG

Reflex builds an **intrusive directed acyclic graph**:

```
signal → memo → memo → effect
  │        ↘
  └─────→ effect
```

- Intrusive links (no arrays)
- O(1) relinking / unlinking
- Deterministic execution order
- Lazy evaluation support
- Stable topology under concurrency

Signals **do not notify**. They mark versions and propagate dirtiness. The scheduler decides when to execute.

---

## Epoch System

Reflex doesn't rely on JavaScript time. It uses **local epochs**.

Each node tracks:

```ts
epoch: number;
version: number;
```

When an event arrives:

```ts
{ target: Node, payload }

1. Validate:
   - LifeState alive?
   - Owner exists?
   - Local epoch valid?
   - Version matches?
   - Observers exist?

2. Only then → apply mutation
```

This makes Reflex **asynchronous-safe by construction**. No race conditions. No stale updates.

---

## Scheduler Model

The scheduler is not a re-render loop.

It's a **universal task orchestrator**:

- Effects
- Async callbacks
- DOM patches
- Worker communication
- IO operations
- Microtasks / macrotasks

Designed for:

- Priority queues
- Frame-based batching
- Deadline-aware scheduling
- Backpressure handling
- Cooperative yielding

Closer to an **OS microkernel** than React Fiber.

---

## Context System

Contexts use **prototype inheritance**, not maps:

```ts
ChildOwner.context = Object.create(ParentOwner.context);
```

Benefits:

- O(1) lookup
- Zero registration overhead
- No provider boilerplate
- Fully deterministic
- Instant propagation

Real lexical scoping — not React's simulated version.

---

## Example

```ts
import { signal, derived, effect, createScope } from "@reflex/core";

createScope(() => {
  const count = signal(0);
  const double = derived(() => count.value * 2);

  effect(() => {
    console.log(count.value, double.value);
  });

  count.value = 5;
});
```

When the scope ends → automatic cleanup. No manual teardown needed.

---

## Optional DOM Surface

```tsx
import { signal, render } from "@reflex/runtime/dom";

function Counter() {
  const count = signal(0);

  return <button onClick={() => count.value++}>Count: {count.value}</button>;
}

render(<Counter />, document.getElementById("app"));
```

DOM is **one renderer** among many. Bind Reflex to:

- Canvas / WebGL
- Terminal (TTY)
- Audio graph
- Server nodes
- Unreal / Unity
- AI simulations
- WASM / embedded systems

---

## Comparison

| System     | Core Identity                          |
| ---------- | -------------------------------------- |
| React      | UI renderer + state manager            |
| Solid      | UI reactivity wrapper                  |
| Vue        | UI + templating runtime                |
| RxJS       | Stream / event library                 |
| **Reflex** | **General-purpose computation engine** |

React thinks in **components**.  
Reflex thinks in **causality graphs**.

---

## Why This Matters

Reflex solves by construction:

- Memory leaks
- Async race corruption
- Zombie updates
- Invalid state replay
- Uncontrolled side effects
- Broken teardown in concurrency

Because it's built on:

- Ownership semantics
- Epoch validation
- Topological ordering
- Mathematical invariants

This is **physics and mathematics** applied to computation.

---

## Roadmap

- ✅ Contract-core separation
- ✅ Intrusive DAG
- ✅ Epoch & validation
- ✅ Ownership GC
- ✅ Scheduler foundation
- 🔄 Runtime adapters
- 🔄 Devtools & visualizer
- 🔄 Persistence layer
- 🔄 Distributed graph support
- 🔄 WASM / Rust kernel

---

## Philosophy

> "Do not re-render reality.  
> Change only what actually changes."

---

## License

MIT © 2025 Andrii Volynets

</div>
