# Reflex Reactive Graph

## 1. Overview
The reactive system of Reflex is represented as a directed acyclic graph (DAG)
where each node maintains explicit ownership and causal links to its dependents.

- **Source nodes** emit updates.
- **Observer nodes** consume and propagate those updates further.

This model provides determinism, composability, and precise lifecycle control.

## 2. Graph Definition
Let `G(V, E)` be the reactive graph, where `V` is the set of reactive nodes and
`E` is the set of directed edges `(v → u)` representing dependencies.

Each node maintains:
- `_flags` — the state flags defining whether it is dirty, scheduled, or disposed.
- `_epoch` — a monotonic timestamp ensuring acyclic update order.

## 3. Core Invariants
1. A node cannot depend on itself.
2. Updates always flow from lower to higher epoch nodes.
3. Removing a node removes all its outgoing edges.
4. Transitions must preserve the topology of the dependency graph.
