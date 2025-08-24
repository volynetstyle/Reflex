# Reflex

**Fine-Grained Reactive UI Library**

> **"Instant Precision: Reactivity Redefined with Compile-Time Intelligence"**

## 🚀 Why Reflex?

Reflex redefines UI development with a focus on **reactivity**, **efficiency**, and **extensibility**. By leveraging a reactive graph and a Rust-based compiler, Reflex eliminates the overhead of traditional Virtual DOM approaches, delivering predictable performance and a streamlined developer experience.

Key attributes include:

- **R — Reactive**: Instantaneous, signal-driven updates with no unnecessary re-renders.
- **E — Efficient**: Optimized through compile-time graph analysis and direct DOM mutations.
- **F — Fine-Grained**: Precise updates target only changed elements, minimizing computational cost.
- **L — Lightweight**: ~5–7 KB minified bundle, ideal for mobile and low-bandwidth environments.
- **E — Extensible**: Plugin-driven reactive graph supports custom nodes and edges.
- **X — eXecutable**: Direct control over effects and updates, bypassing intermediaries.

Unlike Virtual DOM libraries like React, which rely on diffing and component re-renders, Reflex models the UI as a **dynamic reactive graph**. A Rust-based compiler analyzes dependencies at build time, reducing runtime overhead and enabling near-native performance. This approach ensures scalability for complex applications while maintaining simplicity for developers.

Reflex prioritizes:
- **Signals Over Re-Renders**: Updates are confined to actual changes using `signal` and `computed`.
- **Direct DOM Access**: Eliminates diffing, interacting only with affected nodes.
- **Adaptive Graph Topology**: Components form a reactive graph, optimized at compile time.
- **Familiar JSX API**: Seamless integration with JSX, compiled to efficient JavaScript.

## ✨ Core Principles

1. **Fine-Grained Reactivity**  
   `signal` and `computed` primitives enable precise, dependency-tracked updates.

2. **Direct DOM Operations**  
   Bypasses Virtual DOM, performing in-place mutations for maximum efficiency.

3. **Reactive Effects**  
   Replaces lifecycle hooks with automated effects, triggered by dependency changes.

4. **Streaming SSR + Islands Architecture**  
   Hydrates only critical components, supporting resumable server-side rendering.

5. **Graph-Level Extensibility**  
   Plugins extend the reactive graph, enabling custom nodes, edges, and behaviors.

6. **Compile-Time Optimization**  
   A Rust-based compiler analyzes the reactive graph, minimizing runtime computations using graph algebra.

## 🔍 Comparison

| Capability          | Virtual DOM (e.g., React)  | Reflex                          |
|---------------------|----------------------------|---------------------------------|
| **State**           | Hooks/reducers             | `signal`, `computed`            |
| **Updates**         | Component re-renders       | Direct node updates             |
| **DOM Rendering**   | Virtual DOM diffing        | Direct DOM calls                |
| **Reactivity**      | Render-driven              | Fine-grained signals            |
| **SSR**             | Traditional APIs           | Streaming + Resumption + Islands|
| **Lifecycle**       | Lifecycle hooks            | Reactive effects                |
| **Extensibility**   | Hooks/HOCs                 | Graph-level plugins             |
| **Bundle Size**     | ~40–45 KB (minified)       | ~5–7 KB (minified)              |
| **Optimization**    | Runtime diffing            | Compile-time graph analysis     |

## 🧠 Why the Name “Reflex”?

"Reflex" reflects the library’s core philosophy: **immediate, instinctual responses** to state changes. Local updates propagate precisely through the reactive graph, optimized at compile time for responsiveness and simplicity. The name is independent of any external affiliations.

## 🛠️ The Rust Compiler Advantage

Reflex leverages a **Rust-based compiler** to analyze the reactive graph at build time, using **graph algebra** to optimize dependencies and minimize runtime computations. Key benefits include:
- **Static Dependency Analysis**: Eliminates runtime dependency tracking, reducing overhead.
- **Graph Optimization**: Applies topological sorting, dead code elimination, and edge merging.
- **Cycle Detection**: Identifies and resolves cyclic dependencies at compile time.
- **WebAssembly Integration**: Critical operations compiled to WebAssembly for near-native performance.

This approach makes Reflex up to **2–3x faster** than Virtual DOM libraries in dynamic UI scenarios, with a significantly smaller bundle size.

## 🎯 Reflex: A Reactive Core for the Next Generation

Forget re-renders and complexity. Reflex synchronizes data instantly with any environment, from browsers to mobile apps, using a minimal, high-performance core. It’s not just another framework—it’s a **reactive foundation** for modern UI development.

## 📦 Getting Started

**Installation**:

```bash
npm install @reflex/core
```

**Quick Example** (JavaScript):

```javascript
import { signal, computed, effect } from "@reflex/core";

const count = signal(0);
const double = computed(() => count.value * 2);

effect(() => {
  const el = document.getElementById("app");
  if (el) el.textContent = `Count: ${count.value}, Double: ${double.value}`;
});

count.value++; // Updates DOM instantly
```

**JSX Example**:

```jsx
import { signal, computed, render } from "@reflex/core";

function Counter() {
  const count = signal(0);
  const double = computed(() => count.value * 2);

  return (
    <div>
      <p>Count: {count.value}</p>
      <p>Double: {double.value}</p>
      <button onClick={() => count.value++}>Increment</button>
    </div>
  );
}

render(<Counter />, document.getElementById("app"));
```

The Rust compiler transforms JSX into optimized JavaScript, wiring signals and effects into the reactive graph for direct DOM updates.

## 📚 Resources

- **Documentation**: [reflex.dev/docs](https://reflex.dev/docs) (coming soon)
- **GitHub**: [github.com/reflex-ui/core](https://github.com/reflex-ui/core)
- **Community**: Join discussions on [X](https://x.com/reflex_ui) or Discord

## 🏁 License

MIT License © 2025 Andrii Volynets

## ⚖️ Notes

- All product names, logos, and brands are property of their respective owners.
- “React” and related marks are trademarks of Meta Platforms, Inc. Reflex is not affiliated with or endorsed by Meta or any other vendor.
- Package name and branding are subject to change.