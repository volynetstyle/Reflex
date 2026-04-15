# Reflex Runtime — Public Contract

This document specifies the **observable behavior** and **stable guarantees** of `@reflex/runtime` as it exists today.

It is the authoritative source for:

- Public API surface and semantics
- Node kinds and their exact behavior
- Execution context and hooks
- Observable invariants
- What is safe to depend on when extending the runtime

**Do not rely on implementation details not mentioned here.**

See related documents:

- [`README.md`](./README.md) — mental model and quick start
- [`DISPOSE.md`](./DISPOSE.md) — disposal and cleanup semantics
- [`DOC-TOPOLOGY.md`](./DOC-TOPOLOGY.md) — documentation structure
- [`study/`](./study/) — detailed walkthroughs for maintainers
- [`src/reactivity/walkers/README.md`](./src/reactivity/walkers/README.md) — algorithm reference

---

## What This Package Is

`@reflex/runtime` is a **low-level reactive graph engine**.

It does **not** provide:

- `flush()` API
- Built-in scheduler
- Singleton runtime export
- Signal/computed/effect convenience factories
- Event-emitter style public API

Instead, it exports:

- Primitives: `ReactiveNode`, read/write operations, watcher execution
- Context management with host hooks
- State constants and disposal utilities
- Debug introspection surface

---

## Public Exports

### Core Operations

```ts
readProducer(node, context?)        // Return producer payload, track if reading
writeProducer(node, value, compare?, context?)  // Write to producer, invalidate subscribers
readConsumer(node, mode?, context?) // Stabilize consumer, return derived value
runWatcher(node, context?)          // Execute watcher if dirty
disposeWatcher(node)                // Dispose watcher and run cleanup
untracked(fn, context?)             // Execute function without tracking
```

### Node Utilities

```ts
ReactiveNode                        // Constructor: new ReactiveNode(payload, compute, state)
isDisposedNode(node)                // Check if node is disposed
disposeNode(node)                   // Generic disposal (any node kind)
disposeNodeEvent(node)              // Alias of disposeNode()
```

### Type Utilities

```ts
ProducerComparator                  // Type: (prev, next) => boolean
ConsumerReadMode                    // Enum: { lazy, eager }
```

### Execution Context

```ts
createExecutionContext(options)     // Create new context with hooks
getDefaultContext()                 // Get shared default context
setDefaultContext(context)          // Replace default context
resetDefaultContext()               // Restore factory default
```

### Types

```ts
type ExecutionContext               // Execution environment: owns hooks, propagation state
type ExecutionContextOptions        // Constructor options: { onEffectInvalidated?, onReactiveSettled? }
type EngineHooks                    // Hook definitions
type CleanupRegistrar               // Cleanup function registration interface
```

### State Constants

```ts
DIRTY_STATE                         // Union: Invalid | Changed
PRODUCER_INITIAL_STATE              // Factory state for new producers (clean)
PRODUCER_CHANGED                    // Token: direct write changed this producer
PRODUCER_DIRTY                      // Combined: producer is dirty
CONSUMER_INITIAL_STATE              // Factory state: alias of CONSUMER_CHANGED (dirty)
CONSUMER_CHANGED                    // Token: propagation marked as definitely stale
CONSUMER_DIRTY                      // Combined: consumer is dirty
WATCHER_INITIAL_STATE               // Factory state: alias of WATCHER_CHANGED (dirty)
WATCHER_CHANGED                     // Token: propagation marked as definitely stale
WALKER_STATE                        // Bitmask: transient walker execution flags
ReactiveNodeState                   // Enum of all state constants
```

---

## Core Node Model

All reactive behavior is built from `ReactiveNode` with three distinct roles.

### Producer

**Mutable source state.**

```ts
const count = new ReactiveNode(0, null, PRODUCER_INITIAL_STATE);
```

Semantics:

- **Holds state:** Stores committed payload directly in `node.payload`
- **No computation:** `compute` parameter is always `null`
- **On write:** Marks direct subscribers as `Changed`, others as `Invalid`
- **Lifetime:** Can exist indefinitely; writes repeatedly during execution
- **Read:** `readProducer(node)` returns `node.payload` immediately

Key invariant:

- A producer never recomputes
- A producer never depends on other nodes
- Producer writes are immediate and push invalidation synchronously

### Consumer

**Pure derived value.**

```ts
const doubled = new ReactiveNode(undefined, () => {
  return readProducer(count) * 2;
}, CONSUMER_INITIAL_STATE);
```

Semantics:

- **Computes lazily:** Only on explicit `readConsumer()` if dirty
- **Caches result:** Stores payload after computation
- **Tracks dependencies:** Reads during `compute()` create edges
- **Dynamic deps:** Can add/remove dependencies on each recompute
- **Owned by host:** No automatic scheduling

Important:

- `compute()` is **pure**: should not perform side effects
- Edges are tracked during execution, pruned afterward
- Stale dependencies are removed after recompute
- A consumer read returns the latest stable value

### Watcher

**Effect-like sink.**

```ts
const effect = new ReactiveNode(null, () => {
  console.log(readConsumer(doubled));
  return () => console.log("cleanup");
}, WATCHER_INITIAL_STATE);
```

Semantics:

- **No output value:** Does not produce payload for downstream
- **Effect container:** Executes user code with side effects
- **Host-scheduled:** Runs only when host calls `runWatcher()`
- **Cleanup support:** May return a cleanup function
- **Invalidation signals:** Runtime signals dirty state through `onEffectInvalidated` hook

Guarantee:

- Runtime invalidates watchers but does not auto-execute them
- Host owns the scheduler: "when does this run?"
- Cleanup runs before next execution or before disposal

---

## Node State and Initial Values

State constants are intentionally asymmetric:

| Constant | Value | Meaning |
|----------|-------|---------|
| `PRODUCER_INITIAL_STATE` | clean | Fresh producer is clean; no write needed yet |
| `CONSUMER_INITIAL_STATE` | dirty | Fresh consumer is dirty; first read triggers execution |
| `WATCHER_INITIAL_STATE` | dirty | Fresh watcher is dirty; first run executes the effect |

**Why?** A fresh consumer or watcher has never executed, so the first access should definitely run the compute function.

**Important:** These are intentionally **not** meant to be steady-state values in normal operation:

- Producers stay clean until written
- Consumers oscillate between clean (after read) and dirty (after invalidation)
- Watchers stay clean until invalidated or explicitly dirtied

---

## Execution Contexts

Every public operation accepts an optional `ExecutionContext` as the last parameter.

```ts
readProducer(node, context?)
readConsumer(node, mode?, context?)
writeProducer(node, value, compare?, context?)
runWatcher(node, context?)
untracked(fn, context?)
```

If omitted, the default context is used.

### Context Responsibilities

An `ExecutionContext` owns:

- **Active compute tracking:** Which node is currently executing?
- **Propagation bookkeeping:** Transient state during invalidation waves
- **Watcher cleanup storage:** Pending cleanup functions
- **Host hooks:** Callbacks for invalidation and settling events

An `ExecutionContext` does **not** own:

- Graph nodes themselves (nodes are owned by the host)
- Dependency edges (stored on nodes)
- Producer payloads (stored on nodes)

### Context Helpers

```ts
// Create a new context with hooks
const ctx = createExecutionContext({
  onEffectInvalidated(node) {
    pendingWatchers.push(node);
  },
  onReactiveSettled() {
    // Fired when: propagationDepth === 0 && activeComputed === null
    console.log("Graph is idle");
  },
});

// Global default context management
setDefaultContext(ctx);
const sameCtx = getDefaultContext();
resetDefaultContext();  // Restore factory default
```

### Hook Semantics

**`onEffectInvalidated(node)`**

- **When:** Fires synchronously during propagation when a watcher becomes dirty
- **What:** Signals that watcher node needs execution
- **Does not:** Run the watcher for you
- **Typical use:** Queue the watcher for later execution by host scheduler

**`onReactiveSettled()`**

- **When:** Fires when the context reaches quiescence
  - Conditions: `propagationDepth === 0` AND `activeComputed === null`
  - Fired after reads, recomputes, or propagation completion
- **What:** Signals "reactive graph is idle, now is a good time to batch actions"
- **Typical use:** Post-update hooks, deferred work, client notifications

### Practical Rule

Use one context per reactive "world":

```ts
// Option A: Share default context (simple case)
readProducer(a);           // Uses default context
readConsumer(b);           // Uses default context

// Option B: Explicit context (isolation, custom hooks)
const isolated = createExecutionContext({
  onEffectInvalidated(node) { /* custom logic */ },
});
readProducer(a, isolated);
readConsumer(b, isolated);
```

Contexts isolate scheduling hooks and propagation state, not graph ownership.
Multiple contexts can reference the same nodes.

---

## Public Operation Semantics

### `readProducer(node, context?): any`

**Returns:** `node.payload` immediately.

**Tracking:** If a computation is currently active in `context`, this read creates a dependency edge.

**Execution:** Does not stabilize anything; never runs user code.

**Guarantee:** Always returns the current committed state instantly.

### `writeProducer(node, value, compare?, context?): void`

**Commits:** New state to `node.payload`.

**Comparison:** Uses `compare(previous, value)` to decide if payload changed.
- Default: `Object.is`
- Custom comparator: e.g., `(a, b) => a === b` or deep equals

**Propagation:** If changed, immediately invalidates reachable subscribers.

**Semantics:**

1. Compare: `changed = !compare(node.payload, value)`
2. Return early if not changed
3. Commit: `node.payload = value`
4. Propagate: Mark direct subscribers `Changed`, deeper nodes `Invalid`

**Important consequences:**

- Producer writes are **immediate**
- Propagation is **synchronous**
- No consumer compute runs during this call
- No watcher compute runs during this call
- Watcher hooks **may** run during propagation (queueing for execution)

**Typical flow:**

```ts
writeProducer(count, 5, Object.is, ctx);  // Invalidates subscribers
// At this point, derived consumers are marked dirty but not recomputed
// Watchers are queued via onEffectInvalidated hook

readConsumer(derived, ctx);               // Now the consumer recomputes
```

### `readConsumer(node, mode?, context?): any`

**Returns:** Stable derived value.

**Stabilization:** Before returning:
- If node is clean, return cached payload
- If node is `Changed`, recompute immediately
- If node is `Invalid`, verify if upstream actually affects this node

**Read modes:**

```ts
enum ConsumerReadMode {
  lazy = 1 << 0,    // Default: stabilize + track to active outer computation
  eager = 1 << 1,   // Stabilize only; do not create dependency edge
}
```

**`lazy` mode (default):**
- Stabilizes the consumer
- If an outer computation is active, this consumer becomes a dependency
- Use when: "I need this value AND it should affect my parent"

**`eager` mode:**
- Stabilizes the consumer
- Does not subscribe the active outer computation
- Use when: "I need this value but shouldn't create a dependency" (e.g., probing, prewarming)

**Guarantee:** Returns the latest stable value after stabilization completes.

### `runWatcher(node, context?): void`

**Executes** the watcher node if dirty.

**Behavior:**

- **Disposed:** No-op (idempotent)
- **Clean:** No-op
- **Dirty with no real change:** Clears dirtiness, returns
- **Dirty with real change:**
  1. Run previous cleanup (if any)
  2. Clear dirty state
  3. Execute compute function
  4. If compute returns a function, store it as next cleanup

**Returns:** `void` (intentionally).

The absence of a return value is deliberate: watcher scheduling is a **host responsibility**. The runtime only signals "this watcher is dirty" via `onEffectInvalidated`.

**Example:**

```ts
// Host controls when to run queued watchers
const pending: ReactiveNode[] = [];

const ctx = createExecutionContext({
  onEffectInvalidated(node) {
    pending.push(node);
  },
});

// Later, in host's event loop:
while (pending.length > 0) {
  runWatcher(pending.shift()!, ctx);
}
```

### `disposeWatcher(node): void`

**Disposes** the watcher and runs its last cleanup.

**Steps:**
1. Check if already disposed (idempotent)
2. Run previous cleanup function (if any)
3. Mark node `Disposed`
4. Unlink all graph edges
5. Clear compute function
6. Reset payload

**Guarantee:** Safe to call multiple times; only runs cleanup once.

### `disposeNode(node)` and `disposeNodeEvent(node)`

**Generic low-level disposal** for any node kind.

Currently, `disposeNodeEvent` is an alias of `disposeNode`.

**Semantics:** Mark node `Disposed`, eagerly detach edges, block further participation.

(For detailed disposal semantics, see [`DISPOSE.md`](./DISPOSE.md).)

### `untracked(fn, context?): ReturnType<fn>`

**Runs** `fn` with dependency tracking temporarily disabled.

**Effect:** `context.activeComputed` is cleared during execution; reads inside `fn` do not create edges.

**Use case:** "I want to read a value but not depend on it."

```ts
const sum = new ReactiveNode(undefined, () => {
  const a = readProducer(valueA);  // This is tracked
  const hidden = untracked(() => {
    return readProducer(debug);    // This is NOT tracked
  }, ctx);
  return a + hidden;
}, CONSUMER_INITIAL_STATE);
```

---

## Dirty-State Model

State is tracked as a bitmask. Important bits:

```ts
enum ReactiveNodeState {
  Producer = 1 << 0,
  Consumer = 1 << 1,
  Watcher = 1 << 2,
  Invalid = 1 << 3,
  Changed = 1 << 4,
  Visited = 1 << 5,
  Disposed = 1 << 6,
  Computing = 1 << 7,
  Scheduled = 1 << 8,
  Tracking = 1 << 9,
}
```

### Observable Dirty Bits in Normal Flow

- **`Changed`:** Direct upstream dependency definitely changed
- **`Invalid`:** Something upstream may have changed; verify on pull
- **`Disposed`:** Terminal state; node no longer participates

### Transient Bits (Not for Public Reliance)

- **`Computing`:** Temporarily set during compute function execution
- **`Visited`:** Temporary re-entrancy marker in internal walkers
- **`Scheduled`:** Exists in enum; not actively used in current public flow

### Important Clarification

Exported state constants like `PRODUCER_CHANGED`, `CONSUMER_DIRTY`, etc. are mainly for **tests and tooling**:

- **NOT** all exported constants are normal steady-state values
- Producers typically stay **clean** after writes (not dirty)
- These are useful for internal verification, not public policy

```ts
// Example: you should NOT write code like this
if (node.state & PRODUCER_DIRTY) {
  // This check is rarely useful in practice
}

// Instead, use high-level operations
readConsumer(derived);  // Handles all state transitions internally
```

---

## Internal Mechanics You Can Rely On

The runtime implements a bidirectional dependency graph.

### Graph Structure

Each node maintains:

- **Outgoing edges:** `firstOut`, `lastOut` → subscribers
- **Incoming edges:** `firstIn`, `lastIn` → sources
- **Dependency reuse:** `depsTail` → cursor for incremental tracking

### Observable Consequences

#### 1. Push Invalidation, Pull Recomputation

Writes push dirtiness through the graph **immediately**.
Reads pull the graph back to a stable value **on demand**.

**Benefits:**

- Writes are cheap (no computation)
- Unread consumers stay lazy
- Watcher execution policy stays host-controlled

#### 2. Dynamic Dependencies Pruned After Recompute

If a consumer stops reading one branch and starts another:

1. Recompute executes, creates new edges, old edges are loose
2. After recompute completes, stale edges are cleaned up
3. Later writes from the old branch no longer invalidate this consumer

#### 3. Edge Consistency

Every dependency edge exists in **both directions**:

- Source → Subscriber (in source's `firstOut`/`lastOut`)
- Subscriber → Source (in subscriber's `firstIn`/`lastIn`)

If extending the runtime with custom graph mutations, keep both views in sync.

#### 4. Disposal Eagerly Detaches

Disposing a node removes it from its sources and detaches subscribers.
Future invalidation through that path stops immediately.

---

## Observable Invariants

These invariants define the semantic contract:

1. **A consumer executes at most once per stabilization.**
   Once `readConsumer()` returns, the consumer is guaranteed stable.

2. **A producer write never triggers immediate consumer recomputation.**
   Only `readConsumer()` or `runWatcher()` can trigger compute.

3. **Propagation order is topologically consistent.**
   No node receives invalidation before its sources.

4. **Cleanup runs before next execution of the same watcher.**
   If `runWatcher()` is called while the watcher is already dirty, cleanup from
   the previous execution runs first.

5. **Disposed nodes are terminal.**
   Once disposed, a node never participates in graph operations.

6. **Default context remains stable across calls.**
   Unless explicitly changed via `setDefaultContext()`, the default context does
   not change during operation.

---

## Minimal End-to-End Example

```ts
import {
  ConsumerReadMode,
  CONSUMER_INITIAL_STATE,
  PRODUCER_INITIAL_STATE,
  ReactiveNode,
  WATCHER_INITIAL_STATE,
  createExecutionContext,
  readConsumer,
  readProducer,
  runWatcher,
  writeProducer,
} from "@reflex/runtime";

// Host scheduler queue
const pending: ReactiveNode[] = [];

const ctx = createExecutionContext({
  onEffectInvalidated(node) {
    if (!pending.includes(node)) {
      pending.push(node);
    }
  },
});

// Create nodes
const left = new ReactiveNode(1, null, PRODUCER_INITIAL_STATE);
const right = new ReactiveNode(2, null, PRODUCER_INITIAL_STATE);

const sum = new ReactiveNode(undefined, () => {
  return readProducer(left, ctx) + readProducer(right, ctx);
}, CONSUMER_INITIAL_STATE);

const effect = new ReactiveNode(null, () => {
  console.log(`Sum: ${readConsumer(sum, ConsumerReadMode.lazy, ctx)}`);
}, WATCHER_INITIAL_STATE);

// Step 1: First effect execution (establishes tracking)
runWatcher(effect, ctx);
// Output: "Sum: 3"

// Step 2: Mutation
writeProducer(left, 10, Object.is, ctx);
// At this point: effect is queued via onEffectInvalidated

// Step 3: Host drains pending effects
while (pending.length > 0) {
  runWatcher(pending.shift()!, ctx);
}
// Output: "Sum: 12"
```

---

## Debug API: `@reflex/runtime/debug`

Import `subtle` from `@reflex/runtime/debug`:

```ts
import { subtle } from "@reflex/runtime/debug";
```

Useful for introspection:

- `subtle.enabled` → Is debug mode active?
- `subtle.label(node, label)` → Name a node
- `subtle.snapshot(node)` → Capture node state
- `subtle.context(ctx?)` → Get context info
- `subtle.history(ctx?)` → Get execution history
- `subtle.observe(listener, ctx?)` → Watch events
- `subtle.clearHistory(ctx?)` → Clear recorded events
- `subtle.configure(options?, ctx?)` → Configure debug behavior

**Important:** In production builds, `subtle` becomes a no-op or returns empty/undefined.

**Do not** rely on `subtle` for runtime behavior; it is a **debugging aid only**.

---

## Summary

The runtime provides:

- **Explicit node kinds:** Producer (source), Consumer (derived), Watcher (effect)
- **Lazy evaluation:** Consumers recompute on demand, not automatically
- **Host-controlled scheduling:** Watchers are invalidated but not auto-executed
- **Observable dirty states:** Changed vs. Invalid; Disposed is terminal
- **Dynamic dependencies:** Tracked per-compute, pruned afterward
- **Deterministic propagation:** Push invalidation, pull stabilization
- **Composable hooks:** Host integrates custom execution policies via contexts

For deeper algorithm details, see:

- [`src/reactivity/walkers/README.md`](./src/reactivity/walkers/README.md) — push/pull phases, fanout, re-entrancy
- [`study/04-read-and-write-paths.md`](./study/04-read-and-write-paths.md) — detailed control flow
- [`study/07-invariants-dev-and-prod.md`](./study/07-invariants-dev-and-prod.md) — design invariants and enforcement
