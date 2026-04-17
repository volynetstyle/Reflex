# Reflex Runtime: Walker Algorithms

This document describes the **push** and **pull** phases of reactive propagation, the core algorithms that keep the dependency graph in sync.

For step-by-step examples and state diagrams, see the old detailed version in the repo history.

---

## Overview: Two-Phase Propagation

The runtime achieves **cheap invalidation** and **lazy stabilization** by splitting propagation into two phases:

### Phase 1: Push Invalidation (Synchronous)

When you call `writeProducer()`:

```
writeProducer(node, value)
  → compare(old, new)
  → commit payload
  → propagate(node, IMMEDIATE)
     └─ walk outgoing edges, mark subscribers Invalid/Changed
```

**Cost:** O(subscribers), no recomputation.

**Files:** `propagate.ts`, `propagate.invalidate.ts`, `propagate.once.ts`

### Phase 2: Pull Stabilization (On Demand)

When you call `readConsumer()`:

```
readConsumer(node)
  → if clean: return cached value
  → if dirty: shouldRecompute(node)
     └─ recompute() if needed
        └─ rebuild dependencies
        └─ unlink stale edges
```

**Cost:** Only for accessed consumers, recomputes lazily.

**Files:** `recompute.ts`, `recompute.refresh.ts`, `recompute.branch.ts`

---

## Phase 1: Push Invalidation via `propagate()`

### Entry Point

```ts
propagate(startEdge, promote, context)
```

**Parameters:**

- `startEdge` — edge to begin traversal from (direction: source → subscriber)
- `promote` — invalidation token: `IMMEDIATE` (1) or `NON_IMMEDIATE` (0)
- `context` — execution environment

### Algorithm: Linear Edge Walk

Propagation uses a **linear traversal** of the outgoing edge chain:

1. **Start** at `startEdge`, marking the target subscriber
2. **Mark** the subscriber with state token: `Invalid` or `Changed` (based on `promote`)
3. **If watcher:** emit `onEffectInvalidated` hook and stop (don't descend)
4. **If not watcher:** move to next outgoing edge
5. **Repeat** until no more edges

### State Tokens

| Token | Meaning | Propagates To |
|-------|---------|---------------|
| `IMMEDIATE` (1) | Direct producer change | Mark `Changed` here, `Invalid` deeper |
| `NON_IMMEDIATE` (0) | Transitive change | Mark `Invalid` (don't auto-promote) |

**Example:**

```
producer.write(5)
  → propagate(edge(producer → A), IMMEDIATE, ctx)
     A marked: Changed
     → edge(A → B)
     B marked: Invalid (not auto-promoted)
     → edge(B → watcher)
     watcher marked: Invalid, emit hook
```

### Important Details

#### Fast Path Check

Before marking a node, check if it needs slow handling:

```ts
if ((node.state & INVALIDATION_SLOW_PATH_MASK) === 0) {
  // Fast path: simple state update
  node.state |= promote ? Changed : Invalid
} else {
  // Slow path: node is already dirty, visited, computing, or disposed
  // Handle accordingly
}
```

#### Watcher Terminal Node

When propagation reaches a **watcher**:

1. Mark it `Invalid`
2. **Emit** `context.onEffectInvalidated(node)`
3. **Stop traversal** (don't descend into watcher's subscribers)

This is intentional: watchers have no subscribers in the reactive sense.

#### Re-entrancy Handling

If `propagate()` is called while already propagating (nested mutation):

- Use `propagateOnce()` to handle reentrant cases
- Track visited nodes with `Visited` bit to avoid redundant work

**File:** `propagate.once.ts`

### Files

- **`propagate.ts`** — Main propagation walker, handles linear edge traversal
- **`propagate.invalidate.ts`** — Shared subscriber invalidation seam for push walkers
- **`propagate.once.ts`** — Reentrant-safe variant
- **`propagate.constants.ts`** — State tokens and masks

---

## Phase 2: Pull Stabilization

### Entry Point: `readConsumer(node, mode?, context?)`

When you read a consumer, it performs lazy stabilization:

```ts
if (node.state & DIRTY_STATE) {
  // Node is dirty; need to verify or recompute
  shouldRecompute(node, context)
    ? recompute(node, context)
    : clearDirtyBits(node)
} else {
  // Node is clean; return cached value
}
return node.payload
```

### Stabilization Strategy

#### If Node is `Changed`

**Definition:** A direct upstream dependency definitely changed.

**Action:** Recompute immediately. The consumer needs fresh computation.

#### If Node is `Invalid`

**Definition:** Something upstream may have changed, but we don't know if it affects this consumer.

**Action:** Use `shouldRecompute()` to verify:

```ts
shouldRecompute(node, context)
  → walk consumer's dependencies
  → check if any are actually changed/different
  → return true if ANY upstream is truly affected
  → return false if no actual changes detected
```

This is the **key optimization**: unread upstream branches don't trigger recomputation.

### Recompute Process

When `recompute()` runs:

1. **Set up tracking:** `context.activeComputed = node`
2. **Execute compute:** Call `node.compute()`, which may call `readProducer()`, `readConsumer()`, `untracked()`
3. **Record new deps:** Reads are tracked as dependency edges
4. **Unlink stale deps:** Remove edges from previous execution that are no longer read
5. **Clean up:** Clear `Computing` bit, mark `Clean`
6. **Return result:** Cache `node.payload`

### Dependency Tracking

#### Dynamic Dependency Registration

During `node.compute()`:

```ts
const value = readConsumer(source, ctx);
// This creates or maintains an edge: source → node
```

The edge is tracked in `node.depsTail` (dependency cursor).

#### Reorder and Prune

After recompute:

1. **Known deps** (read during compute) are kept
2. **Stale deps** (not read) are unlinked
3. **New deps** (newly read) are added

**File:** `recompute.branch.ts` — handles branch switching and stale pruning

### Edge Unlinking

Stale edges are removed via:

```ts
edge.remove()  // Remove from both directions
// Source no longer invalidates this consumer for that edge
```

Once unlinked, writes to the old source no longer affect this consumer.

### Files

- **`recompute.ts`** — Core recompute orchestration
- **`recompute.refresh.ts`** — Shared recompute + fanout propagation seam for pull walkers
- **`recompute.branch.ts`** — Branch switching, stale-suffix cleanup, edge management

---

## Fanout and Consumer Cascades

When a consumer recomputes and its value changes, it may invalidate downstream consumers:

```
producer.write(new_value)
  → A recomputes, value changes
  → B reads A and is now stale
  → B recomputes on demand when read
```

This is **lazy**: B is marked `Invalid` immediately, but doesn't recompute until accessed.

### Multiple Consumers, Single Change

```
producer.write(5)
  → propagates to [A, B, C] (all marked Invalid/Changed)
  → host reads A: A recomputes
  → host reads B: B recomputes (if A's change affects it)
  → C is never read: no recomputation (lazy!)
```

---

## Re-entrancy and Visited Tracking

### What is Re-entrancy?

A mutation inside a compute function:

```ts
const derived = new ReactiveNode(undefined, () => {
  const val = readProducer(source);
  if (val > 10) {
    writeProducer(otherSource, 99);  // <-- Re-entrance!
  }
  return val;
});
```

### Visited Bit Mechanism

To avoid infinite loops or redundant work, traversals use a **`Visited` bit**:

1. Before starting propagation, mark the wave with a unique ID
2. When visiting a node, check `node.visited`
3. If already visited in this wave, skip (already marked)
4. After wave completes, clear all `Visited` bits

**File:** `propagate.once.ts` handles reentrant cases via `Visited`.

### Safe Re-entrancy Model

The current design ensures:

- New invalidation is queued and processed after the current wave
- Infinite loops are prevented by visited tracking
- State remains consistent after multiple waves

---

## Important Invariants

### 1. Bidirectional Edge Consistency

Every edge must exist in **both directions**:

- In source's `firstOut` chain
- In subscriber's `firstIn` chain

If you unlink an edge, remove from both. Inconsistency causes:

- Graph traversal visits wrong nodes
- Cleanup misses nodes
- Cycles appear or disappear unexpectedly

### 2. Changed vs. Invalid

- **Changed:** Direct mutation happened; recompute needed
- **Invalid:** May be affected; verify on pull

Confusing these causes:

- Unnecessary recomputation (performance hit)
- Stale values (correctness bug)

### 3. Stale Suffix Cleanup

After recompute, remove edges for reads that didn't happen:

```ts
// Before recompute: reads [A, B, C]
// During recompute: only read [A, B]
// After recompute: unlink C

// Later, C.write() doesn't affect this consumer
```

Failing to clean up causes:

- Ghost invalidations
- Memory leaks (circular references)

### 4. Watcher Terminal Node

Propagation stops at watchers; watchers don't have descendants:

```
// OK:
producer → consumer → watcher
  ✓ Propagation reaches watcher
  ✓ Watcher's onEffectInvalidated fires
  ✓ Traversal stops

// NOT OK:
producer → consumer → watcher → [unknown]
  ✗ Walkers don't descend into watcher
```

### 5. Disposal Terminal State

Once `Disposed` is set, the node never reactivates.

After disposal:

- Incoming edges unlinked
- Outgoing edges unlinked
- Compute function cleared
- No future graph operations touch this node

---

## Testing and Verification

### Key Test Suites

```bash
# Core propagation
pnpm test -- runtime.walkers.test.ts

# Semantic correctness
pnpm test -- runtime.semantic.test.ts

# Regression checks
pnpm test -- runtime.walkers_reggression.dev.test.ts

# Walker-specific traversals
pnpm test -- traversal-order.jit.mjs
```

### Regression Pattern: Stale Suffix Not Cleaned

```ts
const a = producer(1);
const b = producer(2);
const d = consumer(() => readProducer(a) + (some_flag ? readProducer(b) : 0));

// Scenario 1: d reads both a and b
readConsumer(d);  // d.deps = [a, b]

// Scenario 2: flag changes, d only reads a now
some_flag = false;
readConsumer(d);  // d should unlink b

// BUG: b.write() still invalidates d
b.write(99);
// If stale suffix cleanup failed, d becomes Invalid even though it doesn't read b
```

### Performance Profile

Use benchmarks to verify walker efficiency:

```bash
pnpm bench:core
```

Key measurements:

- Time per `writeProducer()` (should be O(direct-subscribers))
- Time per `readConsumer()` (should be O(dependencies-recomputed))
- Memory for edge chains (should be linear in graph size)

---

## Related Documentation

- **[../RUNTIME.md](../RUNTIME.md)** — Public API and observable semantics
- **[../DISPOSE.md](../DISPOSE.md)** — Disposal protocol details
- **[../study/04-read-and-write-paths.md](../study/04-read-and-write-paths.md)** — Step-by-step control flow
- **[../study/05-dynamic-dependencies.md](../study/05-dynamic-dependencies.md)** — Tracking and branch switching
- **[../study/07-invariants-dev-and-prod.md](../study/07-invariants-dev-and-prod.md)** — Invariant enforcement
