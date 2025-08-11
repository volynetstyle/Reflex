# Reflex

**Fine-Grained Reactive UI Library**

> Fine-grained reactivity, direct DOM updates, and adaptive component topology — without Virtual DOM overhead.


## 🚀 Why Reflex?

Reflex represents a paradigm shift in UI development, emphasizing reactivity, efficiency, and extensibility. Key attributes include:

- **R — Reactive**: Instantaneous responses to data changes, ensuring updates occur without superfluous renderings.
- **E — Efficient**: Optimized for maximum productivity through direct DOM modifications and minimized computational costs.
- **F — Fine-Grained**: Updates are precisely targeted, affecting only the elements that have genuinely changed.
- **L — Lightweight**: A minimalist core design, free from unnecessary abstractions and complexities.
- **E — Extensible**: Enhanced through plugins and an adaptive topology within the reactive graph.
- **X — eXecutable**: Direct oversight of effect executions and updates, eliminating intermediaries.

Traditional Virtual DOM methodologies depend on diffing algorithms and component re-renders, introducing overhead and complexity in large-scale applications. Reflex adopts signal-driven, precise updates, conceptualizing the UI as a dynamic reactive graph. This approach yields predictable performance and a more intuitive mental model.

Reflex prioritizes:
- **Signals Over Re-Renders**: Updates are confined to actual changes.
- **Direct DOM Access**: Bypasses diffing, interacting solely with pertinent nodes.
- **Adaptive Component Topology**: Components constitute a reactive graph rather than a rigid tree structure.
- **Familiar API**: Empowers developers to design architectures with minimal library interference.


## ✨ Core Principles

1. **Fine-Grained Reactivity**  
   Integrated `signal` and `computed` primitives facilitate precise, minimalistic updates.

2. **Direct DOM Operations**  
   Eliminates the Virtual DOM intermediary, enabling in-place mutations.

3. **Reactive Effects Instead of Lifecycle Hooks**  
   Automates effect execution on dependency alterations, obviating manual configurations like `useEffect`.

4. **Streaming SSR + Islands Architecture**  
   Delivers and hydrates only essential components at the appropriate moments.

5. **Graph-Level Extensibility**  
   Supports a plugin ecosystem at the reactive graph foundation.

## 🔍 Comparison

| Capability          | Virtual DOM Approach       | Reflex                          |
|---------------------|----------------------------|---------------------------------|
| **State**           | Hook/reducer style         | `signal`, `computed`            |
| **Updates**         | Component re-renders       | Direct node updates             |
| **DOM Rendering**   | Virtual DOM diffing        | Direct DOM calls                |
| **Reactivity**      | Render-driven              | Fine-grained signals            |
| **SSR**             | Traditional APIs           | Streaming + Resumption + Islands|
| **Lifecycle**       | Lifecycle hooks            | Reactive effects                |
| **Extensibility**   | Hooks/HOCs                 | Graph-level plugins             |


## 🧠 Why the Name “Reflex”?

The term "Reflex" encapsulates the library's essence of immediate, instinctual propagation of state changes. Local modifications trigger exacting updates throughout the reactive graph, underscoring a commitment to responsiveness, simplicity, and developer control. This nomenclature is independent of any external affiliations.

## 📦 Getting Started

**Installation**:

```bash
npm install @reflex/core
```

**Quick Example**:

```javascript
import { signal, computed, effect } from "@reflex/core";

const count = signal(0);
const double = computed(() => count.value * 2);

effect(() => {
  const el = document.getElementById("app");
  if (el) el.textContent = String(double.value);
});

count.value++;
```

## 🏁 License

MIT License © 2025 Andrii Volynets


## ⚖️ Notes

- All product names, logos, and brands are property of their respective owners.
- “React” and related marks are trademarks of Meta Platforms, Inc. This project is not affiliated with or endorsed by Meta or any other vendor.
- Package name and branding are subject to change.