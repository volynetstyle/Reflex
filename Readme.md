# R.E.A.C.T

Real Evolution of Adaptive Component Topology

> Next‑generation frontend library — fine‑grained reactivity, direct DOM updates, and adaptive component topology without Virtual DOM overhead.

---

## 🚀 Why R.E.A.C.T?

Modern frameworks like React, Vue, and Angular solved many problems—but at a cost. Virtual DOM diffing, excessive component re-renders, and complex state management often introduce inefficiencies that don’t scale well.

R.E.A.C.T takes a different path:

* Signals over re-renders — reactive primitives that update only what changed.
* Direct DOM access — skip diffing; touch only the relevant node.
* Adaptive component topology — treat components as reactive graphs, not static trees.
* Familiar syntax — nothing new to learn; you design, we enable.

---

## ✨ Core Principles

1) Fine‑grained reactivity
   * Built‑in `signal` and `computed` for precise updates.

2) Direct DOM operations
   * Eliminate the Virtual DOM layer; mutate the DOM in place.

3) Reactive effects instead of lifecycle hooks
   * No `useEffect` to wire up. Effects run automatically when dependencies change.

4) Streaming SSR + islands architecture
   * Ship and hydrate only the parts of the UI that matter.

5) Graph‑level extensibility
   * Plug‑in system at the reactive graph layer.

---

## 🔍 Comparison

| Capability | Traditional React | R.E.A.C.T |
| --- | --- | --- |
| State | `useState`, `useReducer` | `signal`, `computed` |
| Updates | Component re-renders | Direct node updates |
| DOM rendering | Virtual DOM diffing | Direct DOM calls |
| Reactivity | Render-driven | Fine‑grained signals |
| SSR | Older APIs | Streaming + Resumption + Islands |
| Lifecycle | `useEffect` | Reactive effects |
| Extensibility | Hooks, HOCs | Graph‑level plug‑ins |

---

## 🧠 Why “Real Evolution”?

R.E.A.C.T is more than a nod to React—it’s a tribute and a next step:

* Real — concrete, non‑abstract DOM updates.
* Evolution — a natural progression beyond Virtual DOM frameworks.
* Adaptive Component Topology — structure UI as a dynamic, reactive graph.

It was bound to happen sooner or later.

---

## 📦 Getting Started

Install:

```bash
npm install @react/core
```

Quick example:

```ts
import { signal, computed, effect } from "@react/core";

const count = signal(0);
const double = computed(() => count.value * 2);

effect(() => {
  document.getElementById("app").textContent = String(double.value);
});

count.value++;
```

---

## 🔮 Roadmap

* [ ] Signal‑based core runtime
* [ ] Direct DOM binding system
* [ ] Streaming SSR with partial hydration
* [ ] Plug‑in API for reactive graph extensions
* [ ] DevTools for graph inspection

---

## 📚 Learn More

* Fine‑grained reactivity explained — https://dev.to/ryansolid/a-hands-on-introduction-to-fine-grained-reactivity-3ndf
* Signals vs. state subscribers — https://preactjs.com/blog/introducing-signals/
* Islands architecture overview — https://jasonformat.com/islands-architecture/

---

## 🏁 License

MIT License © 2025 Andrii Volynets