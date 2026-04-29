# Runtime Invariants — Engineering Contract

This document specifies the invariants that must hold for `@reflex/runtime` to function correctly. For each invariant, we specify:

- **Definition:** What must be true
- **Where enforced:** Which code maintains it
- **How it breaks:** What bugs occur if violated
- **Tested by:** Which tests verify it

---

## 1. Bidirectional Edge Consistency

### Definition

Every dependency edge must exist in **both directions**:

- Forward: in source node's `firstOut`/`lastOut` chain
- Backward: in subscriber node's `firstIn`/`lastIn` chain

```ts
// If there's an edge source → subscriber
// Then BOTH must be true:
source.firstOut → ... → edge → ... → source.lastOut
subscriber.firstIn → ... → edge → ... → subscriber.lastIn
```

### Where Enforced

- **Creation:** `trackRead()` in `src/reactivity/engine/tracking.ts`
- **Removal:** Edge unlinking in `src/reactivity/walkers/recompute.branch.ts`
- **Verification:** Tests use `subtle.snapshot()` to inspect edge chains

### How It Breaks

If you unlink an edge from one direction but not the other:

- **Symptom 1:** Graph traversal visits wrong nodes or misses nodes
- **Symptom 2:** Propagation reaches unintended consumers or misses invalidations
- **Symptom 3:** Cleanup doesn't find nodes, leaving dangling references
- **Symptom 4:** Memory leaks (circular references don't get collected)

### Example Violation

```ts
// WRONG: unlink only from forward
edge.prev.next = edge.next;
edge.next.prev = edge.prev;
// DON'T unlink from subscriber's incoming

// Result: subscriber.firstIn still points to removed edge
// Later: propagation traverses a dead edge
```

### Tested By

- `tests/runtime.traversal.test.ts` — edge chain integrity
- `tests/runtime.semantic.test.ts` — graph correctness across operations
- Development assertions in `src/reactivity/shape/ReactiveEdge.ts`

---

## 2. Changed vs. Invalid Semantics

### Definition

| State | Meaning | Action on Read |
|-------|---------|---|
| `Changed` | Direct upstream definitely changed | Always recompute |
| `Invalid` | Transitive upstream may have changed | Verify via `shouldRecompute()` |
| Clean | No invalidation | Return cached value |

```ts
// After writeProducer:
direct_subscriber.state |= Changed    // Direct: definitely changed
transitive_subscriber.state |= Invalid // Transitive: maybe changed
```

### Where Enforced

- **Propagation:** `src/reactivity/walkers/propagate.ts` — marks `Changed` vs. `Invalid`
- **Stabilization:** `src/reactivity/walkers/recompute.ts` — decides recompute strategy

### How It Breaks

Confusing these causes:

- **If you always recompute on `Invalid`:**
  - Performance regression: expensive unnecessary recomputation
  - Correctness may still be OK (but wasteful)

- **If you skip recompute on `Changed`:**
  - **Correctness bug:** stale values returned
  - Consumer sees outdated payload
  - Cascade invalidations use wrong data

### Example Violation

```ts
// WRONG: treat Changed the same as Invalid
if (node.state & (Changed | Invalid)) {
  // Do expensive verification instead of immediate recompute
  if (shouldRecompute(node)) {
    recompute(node);
  }
}
// Result: first-level consumers don't update after direct producer change
```

### Tested By

- `tests/runtime.semantic.test.ts` — stale-value detection
- `tests/runtime.walkers.test.ts` — propagation token validation
- Performance benchmarks should show no regression

---

## 3. Stale Dependency Pruning

### Definition

After a consumer recomputes, edges for reads that did **not** occur must be unlinked.

```ts
// Before recompute: deps = [A, B, C]
// During recompute: code reads [A, B] only
// After recompute: deps = [A, B], edge to C unlinked

// Later: C.write() does NOT invalidate this consumer
```

### Where Enforced

- **Dependency recording:** `src/reactivity/engine/tracking.ts`
- **Recompute orchestration:** `src/reactivity/walkers/recompute.ts`
- **Stale cleanup:** `src/reactivity/walkers/recompute.branch.ts` — `unlinkStaleSuffix()`

### How It Breaks

If stale edges persist:

- **Symptom 1:** Ghost invalidations — consumer marked dirty from unrelated branches
- **Symptom 2:** Memory leak — circular references through stale edges
- **Symptom 3:** Overcounting — dependent chains think they're affected when they're not

### Example Violation

```ts
// WRONG: mark new deps but don't unlink old ones
for (const dep of newDeps) {
  createEdge(dep, consumer);
}
// Missing: unlinkStaleSuffix(consumer);

// Result: consumer still has edge to oldDep
// Later: oldDep.write() invalidates consumer even though it doesn't read it
```

### Tested By

- `tests/runtime.semantic.test.ts` — branch switching scenarios
- `tests/runtime.walkers.test.ts` — dependency lifecycle
- Regression: `tests/runtime.walkers_reggression.dev.test.ts`

---

## 4. depsTail Cursor Validity

### Definition

`depsTail` is a cursor used to reuse edges from previous executions.

```ts
// Before recompute:
node.firstIn = edge0 → edge1 → edge2 → node.lastIn
node.depsTail = edge0 (cursor)

// During recompute: if we read depsTail's source again, reuse it
// After recompute: depsTail points to last reused edge, unlink everything after

depsTail = old_edge0
unlink: old_edge1, old_edge2 (stale suffix)
```

### Where Enforced

- **Initialization:** `src/reactivity/engine/tracking.ts` — set depsTail at recompute start
- **Reuse:** `trackRead()` checks if depsTail's source matches
- **Cleanup:** `src/reactivity/walkers/recompute.branch.ts` — unlink from depsTail to lastIn

### How It Breaks

Incorrect cursor management causes:

- **Symptom 1:** Edges added but never used (waste of memory)
- **Symptom 2:** Stale edges not cleaned (unrelated invalidations)
- **Symptom 3:** Performance regression (O(n²) instead of O(n) edge processing)

### Example Violation

```ts
// WRONG: forget to update depsTail after reusing an edge
if (depsTail && depsTail.from.id === readDep.id) {
  // Reuse edge, but don't advance cursor
  // depsTail stays at same edge
}
// Result: same edge gets reprocessed on every read
// Later: duplicate edges exist
```

### Tested By

- `tests/runtime.semantic.test.ts` — edge reuse patterns
- Performance benchmarks — `tracking-cleanup-matrix.jit.mjs`

---

## 5. Disposal is Terminal

### Definition

Once a node is marked `Disposed`, it:

- Never participates in graph operations
- Never executes user code
- Never receives new edges
- Only participates in cleanup/unlinking

```ts
if (node.state & Disposed) {
  // All entry points must early-return or no-op
  return; // readProducer, readConsumer, writeProducer, runWatcher, etc.
}
```

### Where Enforced

- **Disposal entry point:** `disposeNode()` in `src/reactivity/index.ts`
- **Graph entry points:** Each operation checks `if (isDisposedNode(node)) return`
- **Propagation:** Disposed nodes don't participate in `propagate()`

### How It Breaks

If a disposed node reactivates or participates:

- **Symptom 1:** Dangling cleanup functions execute unexpectedly
- **Symptom 2:** Circular references keep nodes alive
- **Symptom 3:** Effects fire after component unmount
- **Symptom 4:** Double-cleanup (cleanup runs twice)

### Example Violation

```ts
// WRONG: allow read after disposal
node.state |= Disposed;
node.compute = null;

// Later, someone calls readConsumer:
if (node.state & Disposed) {
  // DON'T do this:
  recompute(node);  // compute is null, will crash
}
// Correct:
if (node.state & Disposed) {
  return node.payload;  // return cached value only
}
```

### Tested By

- `tests/runtime.lifecycle.test.ts` — disposal semantics
- `tests/runtime.test_utils.ts` — disposal verification helpers
- DISPOSE.md tests

---

## 6. Cleanup Ordering

### Definition

For each watcher:

1. **On rerun:** Previous cleanup executes **before** new compute
2. **On disposal:** Cleanup executes exactly once
3. **Order:** Nested cleanups execute in LIFO order (innermost first)

```ts
watcher.cleanup?();     // Run old cleanup FIRST
watcher.compute();      // Then run new compute
watcher.cleanup = result; // Store new cleanup
```

### Where Enforced

- **Watcher execution:** `runWatcher()` in `src/api/watcher.ts`
- **Disposal:** `disposeWatcher()` in same file

### How It Breaks

Wrong cleanup order causes:

- **Symptom 1:** Resource double-release (cleanup-then-recompute violates this)
- **Symptom 2:** State inconsistency (new cleanup expects old state)
- **Symptom 3:** Observable side effects in wrong order

### Example Violation

```ts
// WRONG: run new compute before old cleanup
watcher.compute();         // new compute runs
result = watcher.cleanup;  // then old cleanup
watcher.cleanup = result;

// Effect: old cleanup sees new state, can corrupt it
```

### Tested By

- `tests/runtime.lifecycle.test.ts` — cleanup sequencing
- DISPOSE.md — detailed cleanup protocol tests

---

## 7. Propagation Topological Order

### Definition

No node receives invalidation before its **direct upstream dependencies**.

```ts
// If: source → A → B
// Then: propagate must reach source first, then A, then B
// NOT: B before A
```

### Where Enforced

- **Linear traversal:** `src/reactivity/walkers/propagate.ts` — walk via edge chain
- **No priority queues:** Runtime doesn't reorder subscribers

### How It Breaks

Violating topological order causes:

- **Symptom 1:** Cascading recomputation in wrong order
- **Symptom 2:** `shouldRecompute()` makes wrong decision (upstream not yet invalidated)
- **Symptom 3:** Stale values temporarily visible

### Example Violation

```ts
// WRONG: reorder propagation by priority
let toProcess = [B, A, source];  // wrong order
for (const node of toProcess) {
  propagateToSubscribers(node);
}
// Result: B processed before A, which hasn't processed source yet
```

### Tested By

- `tests/traversal-order.jit.mjs` — topological order verification
- `tests/runtime.semantic.test.ts` — correctness across configurations

---

## 8. Re-entrancy Safety

### Definition

If `writeProducer()` is called during a compute or propagation:

1. Current wave completes
2. New invalidations are queued
3. No infinite loops or state corruption

```ts
const derived = new ReactiveNode(undefined, () => {
  const val = readProducer(source);
  if (val > 10) {
    writeProducer(other, 99);  // <-- Re-entrance
  }
  return val;
});
```

### Where Enforced

- **Visited tracking:** `src/reactivity/walkers/propagate.once.ts`
- **Propagation depth:** `context.propagationDepth` prevents nested waves
- **Queue handling:** New invalidations deferred until depth === 0

### How It Breaks

Incorrect re-entrancy handling causes:

- **Symptom 1:** Infinite loops (mutual re-entrancy)
- **Symptom 2:** State corruption (propagation mid-flight)
- **Symptom 3:** Visited bit not cleared (subsequent propagations marked visited)

### Tested By

- `tests/runtime.semantic.test.ts` — re-entrancy scenarios
- `tests/runtime.hooks.test.ts` — context propagation depth

---

## 9. Context Isolation

### Definition

Operations in one context don't affect another context.

```ts
const ctx1 = createExecutionContext({ ... });
const ctx2 = createExecutionContext({ ... });

readConsumer(node, ctx1);  // affects ctx1's tracking
readConsumer(node, ctx2);  // doesn't affect ctx1
```

### Where Enforced

- **Context parameter:** All operations accept `context?`
- **Default context:** Fallback to shared default if omitted
- **Tracking storage:** Per-context cleanup, activeComputed, etc.

### How It Breaks

Context leakage causes:

- **Symptom 1:** Operations in one "world" affect another
- **Symptom 2:** Hooks fire unexpectedly in wrong context
- **Symptom 3:** Cleanup runs at wrong time

### Tested By

- `tests/runtime.connect.test.ts` — multi-context scenarios
- Integration tests with custom contexts

---

## 10. No Immediate Watcher Execution

### Definition

When a watcher is invalidated via propagation, it **does not execute immediately**.

Instead:
1. `onEffectInvalidated(node)` hook fires (host decides what to do)
2. Watcher is marked `Invalid`
3. Host calls `runWatcher()` when appropriate

```ts
writeProducer(source, newValue);  // Invalidates watcher
// Watcher.compute() is NOT called here
// Only onEffectInvalidated hook fires

// Later, host decides:
runWatcher(watcher);  // NOW it executes
```

### Where Enforced

- **Propagation:** `src/reactivity/walkers/propagate.ts` — stops at watcher, emits hook
- **No auto-execution:** `src/api/watcher.ts` — `runWatcher()` is host-called

### How It Breaks

Auto-executing watchers causes:

- **Symptom 1:** Lost host control over scheduling
- **Symptom 2:** Effects can't batch or defer
- **Symptom 3:** Nondeterministic execution (depends on propagation order)

### Tested By

- `tests/runtime.semantic.test.ts` — effect scheduling
- `tests/runtime.hooks.test.ts` — hook invocation timing

---

## Summary Table

| # | Invariant | Enforced By | Broken If | Test |
|-|-|-|-|-|
| 1 | Bidirectional edges | Edge creation/removal | Graph traversal wrong | traversal.test |
| 2 | Changed vs. Invalid | propagate + recompute | Stale values | semantic.test |
| 3 | Stale pruning | recompute.branch.ts | Ghost invalidations | semantic.test |
| 4 | depsTail cursor | tracking.ts | Performance regression | perf benchmarks |
| 5 | Disposal terminal | All entry points | Effects post-disposal | lifecycle.test |
| 6 | Cleanup order | runWatcher, disposeWatcher | Resource leaks | lifecycle.test |
| 7 | Topological order | propagate.ts | Cascading recompute wrong | traversal-order.jit |
| 8 | Re-entrancy safe | propagate.once + depth | Infinite loops | semantic.test |
| 9 | Context isolation | Context parameter | Cross-context leakage | connect.test |
| 10 | No immediate watchers | propagate hook | Lost host control | semantic.test |

---

## Before Modifying the Runtime

1. **Read this document** in full
2. **Run tests:** `pnpm test` to see current invariants
3. **Map your changes** against invariants 1–10
4. **Add test cases** that verify your change doesn't violate them
5. **Run regression:** `pnpm test -- regression` to catch slips

See [study/README.md](../study/README.md) and [MAINTENANCE.md](./MAINTENANCE.md) for detailed maintenance guidelines.
