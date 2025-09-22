# Reflex

**Fine-Grained Reactive UI Framework**

> **“Reactivity Without Re-Renders — a Compiler-Driven Approach to UI”**

---

## 🚀 Overview

Reflex is a next-generation UI library that eliminates the inefficiencies of Virtual DOM frameworks. Instead of relying on component re-renders and runtime diffing, Reflex builds UIs as **fine-grained reactive graphs**, optimized at **compile time** with a Rust-based compiler.

The result: **instant updates, minimal runtime cost, and predictable scalability** across browsers, mobile, and beyond.

---

## ✨ Key Advantages

* **Signals Instead of Re-Renders**
  Updates are scoped to actual state changes (`signal`, `computed`, `effect`) without re-executing entire components.

* **Direct DOM Mutations**
  Skip the Virtual DOM. Reflex applies updates directly to the real DOM with no intermediate diffing.

* **Async-Aware Reactivity**
  Signals can represent `pending`, `fulfilled`, or `rejected` states natively — no hacks like Suspense.

* **Transactional Coarse Layer**
  Root-level batching and snapshots ensure consistent updates, streaming SSR, and resumable hydration.

* **Isolated Fine Trees**
  Each component forms its own mini-graph, enabling efficient local recomputation rather than global invalidation.

* **Orchestrated Side Effects**
  A dedicated scheduler manages DOM patches, timers, network calls, and workers with priorities, deadlines, and cancellation.

* **Rust Compiler Optimization**
  Static dependency analysis, dead-edge elimination, cycle detection, and graph algebra produce minimal runtime overhead.

* **Lightweight by Design**
  Core size of \~5–7 KB minified, with performance 2–3× faster than Virtual DOM libraries in dynamic scenarios.

---

## 🧩 Architectural Layers

Reflex organizes its runtime into **three distinct layers**:

1. **Coarse Layer (Tree & Transactions)**

   * Represents the component tree, props snapshots, and keyed hierarchy.
   * Handles batching, mounting/unmounting, server streams, and SSR chunking.
   * Acts as the **event and state ingress point** (store, router, server pushes).

2. **Fine Layer (Signals & Computations)**

   * Reactive primitives: `signal`, `computed`, selectors, and bindings.
   * Maintains a dependency graph for **precise invalidation + recompute**.
   * Local recomputation only — avoids the “global render storm” problem.

3. **Orchestration Layer (Effects & Scheduling)**

   * Manages declarative side effects: DOM mutations, network, timers, workers.
   * Provides **arbitration**: prioritization, deduplication, cancellation, deadlines.
   * Decouples effects from reactivity to preserve purity in the fine graph.

---

## 🔍 Reflex vs. Virtual DOM

| Capability        | Virtual DOM (React, etc.)  | Reflex                               |
| ----------------- | -------------------------- | ------------------------------------ |
| **State**         | Hooks, reducers            | Signals, computed, async-aware       |
| **Updates**       | Component re-renders       | Localized graph recomputation        |
| **DOM Handling**  | Diff & patch               | Direct DOM mutations                 |
| **Reactivity**    | Render-driven              | Fine-grained signals                 |
| **SSR**           | Blocking or streaming APIs | Streaming + resumable hydration      |
| **Lifecycle**     | Hooks                      | Reactive effects                     |
| **Extensibility** | Hooks/HOCs/context         | Graph-level plugins & custom nodes   |
| **Performance**   | Runtime diffing            | Compile-time optimized graph algebra |
| **Bundle Size**   | \~40–45 KB                 | \~5–7 KB                             |

---

## 🛠️ Rust Compiler Advantage

Reflex uses a **Rust-based compiler** to pre-optimize the reactive graph:

* **Static Dependency Resolution** — removes runtime bookkeeping.
* **Graph Algebra** — merges edges, sorts topologies, eliminates dead nodes.
* **Cycle Detection** — fails early instead of causing runtime bugs.
* **WebAssembly Integration** — hot paths compiled to WASM for near-native speed.

This allows Reflex to **outperform React by 2–3×** in highly dynamic UIs, while delivering a much smaller runtime footprint.

---

## 📦 Getting Started

**Install:**

```bash
npm install @reflex/core
```

**Basic Example:**

```javascript
import { signal, computed, effect } from "@reflex/core";

const count = signal(0);
const doubled = computed(() => count.value * 2);

effect(() => {
  document.getElementById("app").textContent =
    `Count: ${count.value}, Double: ${doubled.value}`;
});

count.value++; // DOM updates instantly
```

**JSX Example:**

```jsx
import { signal, computed, render } from "@reflex/core";

function Counter() {
  const count = signal(0);
  const doubled = computed(() => count.value * 2);

  return (
    <div>
      <p>Count: {count.value}</p>
      <p>Double: {doubled.value}</p>
      <button onClick={() => count.value++}>Increment</button>
    </div>
  );
}

render(<Counter />, document.getElementById("app"));
```

---

## 🧠 Why the Name “Reflex”?

A **reflex** is an immediate, instinctual response. That’s exactly what Reflex provides: **instantaneous, fine-grained propagation** of state changes, without waiting on re-renders or runtime diffing.

---

## 📚 Resources

* Documentation (coming soon): [reflex.dev/docs](https://reflex.dev/docs)
* GitHub: [github.com/reflex-ui/core](https://github.com/reflex-ui/core)
* Community: [X](https://x.com/reflex_ui) • Discord

---

## 🏁 License

MIT License © 2025 Andrii Volynets

---

This rewrite fully integrates the **Coarse/Fine/Orchestration model**, async-aware signals, transaction support, and effect arbitration — everything your architecture brings beyond React.

Хочешь, я ещё сделаю **визуальную архитектурную схему** (Coarse → Fine → Orchestration), чтобы прямо в README вставить картинкой?
