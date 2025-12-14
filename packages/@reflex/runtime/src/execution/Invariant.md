# Design Axioms: Stack–Based execution

## Scope

These axioms define how **execution context**, **dependency registration**, and **execution order** are handled in the runtime.
They intentionally avoid global mutable context and scheduler-driven ordering.

---

## Axiom A1 — Explicit Execution Context

The runtime SHALL represent execution context explicitly as an **execution stack**.

- The execution stack is an ordered sequence of nodes:

  ```
  S = [n₀, n₁, …, nₖ]
  ```

- `nₖ` is the currently executing node.
- No other mechanism (global variables, thread-local state) SHALL be used to infer execution context.

---

## Axiom A2 — Stack Discipline

Execution SHALL obey strict stack discipline.

- A node MAY be pushed onto the execution stack only if it is causally reachable from the current top.
- A node SHALL be popped from the stack exactly once, after its execution completes.
- The execution stack SHALL always represent a simple path (no duplicates).

---

## Axiom A3 — Execution Height

The **execution height** of a node during execution is defined as:

```
height(nₖ) = |S| − 1
```

- Execution height is derived directly from stack depth.
- Execution height SHALL NOT be stored, cached, or recomputed externally.
- Execution height SHALL NOT be corrected post-factum.

---

## Axiom A4 — Dependency Registration Constraint

A dependency MAY be registered only under the following condition:

```
dep ∈ S \ {nₖ}
```

That is:

- A node MAY depend only on nodes currently present **below it** in the execution stack.
- Dependencies to nodes not in the execution stack SHALL be rejected.

This axiom is enforced at dependency-registration time.

---

## Axiom A5 — Structural Acyclicity

The execution stack SHALL be acyclic by construction.

- No node MAY appear more than once in the stack.
- Cyclic dependencies are therefore structurally impossible.

---

## Axiom A6 — Scheduler Independence

The scheduler SHALL NOT determine causality.

- The scheduler MAY choose any node for execution **only if** Axioms A1–A5 remain satisfied.
- Reordering by the scheduler SHALL NOT affect correctness.

---

## Axiom A7 — No Global “Current Execution” State

The runtime SHALL NOT maintain any global variable equivalent to:

```
currentNode
currentEffect
currentContext
```

All execution context SHALL be derivable exclusively from the execution stack.

---

## Axiom A8 — Async Boundary Rule

Asynchronous continuations SHALL NOT reuse the current execution stack.

- An async continuation SHALL start with a new execution stack.
- Causal identity across async boundaries SHALL be preserved via explicit causal coordinates or equivalent metadata.
- Async execution SHALL be treated as a new execution trace.

---

## Axiom A9 — No Runtime Order Repair

The runtime SHALL NOT perform:

- dynamic height adjustment,
- priority rebalancing,
- post-execution order correction.

If an execution order violation occurs, it SHALL be treated as a **structural error**, not repaired.

---

## Axiom A10 — Useful Measurement Principle

All runtime bookkeeping MUST serve execution semantics directly.

- The execution stack SHALL provide:
  - current execution context,
  - execution height,
  - dependency validity checks.

- No auxiliary structures (e.g. heaps, repair queues) SHALL exist solely to infer ordering.

---

## Derived Guarantees

If Axioms A1–A10 are satisfied, the system guarantees:

1. **No implicit global state**
2. **Deterministic dependency formation**
3. **Structural prevention of race conditions**
4. **Scheduler-agnostic correctness**
5. **Elimination of dynamic order repair mechanisms**

---

## Non-Goals

These axioms intentionally do NOT define:

- graph construction policies,
- scheduling strategies,
- memory layout,
- batching or flushing semantics.

They define **what is allowed**, not **how it is optimized**.

---

## Summary

> Execution order is derived from execution itself.
> Height is measured, not guessed.
> Causality is enforced structurally, not repaired dynamically.
