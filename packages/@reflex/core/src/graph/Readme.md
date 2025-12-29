# **Reflex Reactive Graph Architecture**

## **1. Conceptual Foundation**

Reflex models reactivity as a **directed acyclic computation graph (DAG)** where change propagation follows strict causal ordering. Each node plays a specific role in the dataflow:

- **Sources** produce values and notify their dependents when changes occur.
- **Observers** perform computations and react when any of their upstream dependencies change.

This architecture preserves causality, ensures deterministic evaluation, and provides explicit lifecycle control for every node in the dependency graph.

---

## **2. Graph Topology**

Let `G = (V, E)` represent the Reflex reactive graph:

- `V` — the set of all nodes (sources or observers)
- `E` — the set of directed edges `v → u`, indicating that node `u` depends on node `v`

Each node maintains core metadata fields:

- **flags** — bitwise state flags (dirty, scheduled, running, disposed)
- **epoch** — local causal timestamp, monotonically increasing with each change
- **version / upstream_version** — fingerprints of local and upstream state for incremental update detection
- **sources / observers** — intrusive doubly-linked adjacency lists for dependencies

This structure enables efficient change propagation and dependency tracking with minimal allocation overhead.

---

## **3. Core Invariants**

To maintain correctness and determinism, Reflex enforces the following invariants:

### **3.1 Acyclicity**

No node can depend on itself, directly or transitively. All computations form a proper DAG with no cycles.

### **3.2 Monotonic Causality**

Updates always move forward in causal time. An event from a source is applied only if its epoch is not less than the dependent node's epoch. This eliminates the possibility of stale or out-of-order updates.

### **3.3 Clean Disposal**

When a node is disposed, all outgoing edges are removed. Downstream and dependent nodes cease referencing it, and all cleanup callbacks are invoked to prevent resource leaks.

### **3.4 Topology Preservation**

Any modification to dependencies maintains DAG structure. Insertion or replacement of upstream nodes occurs during the tracking phase with guarantees that the new dependency tree remains acyclic and locally ordered.

### **3.5 Intrusive Edge Stability**

All edges are stored as intrusive linked list nodes. Link/unlink operations are O(1) and do not require search or reallocation, ensuring predictable performance even with thousands of dependencies.

---

## **4. Update Propagation Pipeline**

Updates in Reflex flow through a three-phase pipeline:

### **Phase 1: Mark Dirty**

When a source changes:

- The node is marked with the `DIRTY` flag
- It's added to the scheduler queue if not already present
- All direct observers are notified to prepare for potential re-evaluation

### **Phase 2: Schedule & Evaluate**

The scheduler processes dirty nodes in causal order:

- Compare node's `version` against `upstream_version`
- If any upstream source is newer, trigger re-computation
- Track new dependencies discovered during evaluation
- Update intrusive adjacency lists atomically

### **Phase 3: Commit & Notify**

After successful computation:

- Increment `version` to reflect new state
- Update `epoch` to maintain causal consistency
- Propagate notifications to all dependent observers
- Mark node as clean and remove from scheduler queue

This pipeline ensures that:

- No observer runs before its dependencies are current
- Re-computation happens only when truly necessary
- All changes propagate in topological order

---

## **5. Dependency Tracking Mechanism**

Reflex uses **automatic dependency tracking** during observer evaluation:

### **5.1 Tracking Context**

When an observer runs:

- A tracking context is established
- Any source accessed during evaluation registers itself
- New dependencies replace old ones atomically

### **5.2 Incremental Updates**

Before re-running an observer:

- Compare current dependencies with previous snapshot
- Unlink removed dependencies using `unlinkSourceFromObserverUnsafe`
- Link new dependencies using `linkSourceToObserverUnsafe`
- Fast-path optimization: if `lastOut` matches, O(1) duplicate detection

### **5.3 Batch Dependency Changes**

For observers with many sources:

- Use `linkSourceToObserversBatchUnsafe` for bulk linking
- Pre-allocate arrays with exact size for V8 optimization
- Sequential iteration leverages hardware prefetching

---

## **6. Disposal & Cleanup Semantics**

Node disposal follows a strict protocol to prevent dangling references and resource leaks:

### **6.1 Explicit Disposal**

```typescript
// Remove all outgoing edges (this node stops observing others)
unlinkAllSourcesUnsafe(node);

// Remove all incoming edges (others stop observing this node)
unlinkAllObserversUnsafe(node);

// Invoke cleanup callbacks
node.cleanup?.();

// Mark as disposed
node.flags |= DISPOSED;
```

### **6.2 Subtree Disposal**

When disposing a subgraph:

- Use chunked unlink strategies for stability
- Process nodes in reverse topological order
- Ensure no observer outlives its sources

### **6.3 Disposal Guarantees**

- All edges are removed in O(k) time where k = degree
- Disposed nodes never participate in future updates
- Cleanup callbacks run exactly once
- No memory leaks from cyclic references

---

## **7. Performance Characteristics**

Reflex achieves high performance through careful optimization:

### **7.1 Intrusive Data Structures**

- O(1) edge insertion/removal without search
- Zero allocation for structural changes
- Cache-friendly memory layout

### **7.2 Fast-Path Optimizations**

- `lastOut` check covers 90%+ of duplicate detection cases
- Count-based fast paths for empty/single-edge cases
- Pre-sized arrays maintain V8 PACKED_ELEMENTS shape

### **7.3 Incremental Computation**

- Version fingerprints avoid unnecessary re-runs
- Only dirty subgraphs are evaluated
- Topological ordering ensures minimal passes

### **7.4 Memory Efficiency**

- Intrusive edges eliminate pointer indirection
- No separate adjacency matrix or list allocation
- Nodes store only essential metadata

---

## **8. Comparison with Other Reactive Systems**

### **vs Vue 3.5 Reactivity**

- **Similar**: Intrusive link structures, depsTail optimization
- **Different**: Reflex uses explicit epochs instead of global effect stack

### **vs SolidJS**

- **Similar**: DAG-based propagation, automatic tracking
- **Different**: Reflex emphasizes low-level control and O(1) guarantees

### **vs MobX**

- **Similar**: Transparent dependency tracking
- **Different**: Reflex exposes graph primitives for fine-grained optimization

---

## **9. Design Philosophy**

Reflex Reactive Graph embodies these principles:

### **9.1 Explicit Over Implicit**

- Clear lifecycle boundaries for every node
- No hidden global state or ambient context
- Predictable disposal and cleanup semantics

### **9.2 Performance by Design**

- Intrusive data structures eliminate allocation
- Fast-path optimizations for common cases
- Cache-friendly memory layout

### **9.3 Correctness First**

- Strong invariants prevent subtle bugs
- Monotonic causality eliminates race conditions
- Deterministic evaluation order

### **9.4 Low-Level Primitives**

- Building blocks for higher-level abstractions
- No framework lock-in or magic behavior
- Full control over update scheduling

---

## **10. Summary**

The Reflex Reactive Graph is a **low-level reactive kernel** that provides:

- ✅ Cycle-free DAG structure with strict causal ordering
- ✅ Intrusive linked lists for O(1) structural updates
- ✅ Local epochs and versions for incremental computation
- ✅ Deterministic, predictable evaluation semantics
- ✅ Zero-overhead dependency tracking
- ✅ Clean disposal without resource leaks

This forms the foundation for building consistent, predictable, and high-performance reactive systems in Reflex.

---

## **11. Future Directions**

Potential enhancements under consideration:

### **11.1 Structure-of-Arrays (SoA) Layout**

- Convert node fields to columnar storage
- Improve cache locality during batch operations
- SIMD-friendly data access patterns

### **11.2 Parallel Evaluation**

- Identify independent subgraphs for concurrent execution
- Lock-free edge modifications using atomic operations
- Work-stealing scheduler for multi-threaded updates

### **11.3 Persistent Data Structures**

- Immutable graph snapshots for time-travel debugging
- Structural sharing for efficient history tracking
- Copy-on-write semantics for optimistic updates

### **11.4 Advanced Scheduling**

- Priority-based update ordering
- Debouncing and throttling at graph level
- Batched commits for transaction-like semantics
