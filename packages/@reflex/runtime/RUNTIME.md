# Reflex Runtime: Public API & Implementation Internals

**This document provides comprehensive documentation of the Reflex runtime's public API, detailed implementation mechanics, walker algorithms, and critical invariants that must be maintained across all changes.**

---

## Table of Contents

1. [Public API Overview](#public-api-overview)
2. [Node Model & Types](#node-model--types)
3. [Execution Context](#execution-context)
4. [Implementation Mechanics](#implementation-mechanics)
5. [Walkers: Deep Dive](#walkers-deep-dive)
6. [Invariants & Guarantees](#invariants--guarantees)
7. [State Transition Rules](#state-transition-rules)

---

## Public API Overview

The public API is divided into three core surfaces:

### 1. **Node Creation & Lifecycle**

```typescript
// From @reflex/runtime
export {
  // Context
  createExecutionContext,
  getDefaultContext,
  setDefaultContext,
  resetDefaultContext,
  type ExecutionContext,
  type EngineHooks,
  type CleanupRegistrar,
  
  // Node operations
  disposeNode,
  disposeNodeEvent,
  isDisposedNode,
  
  // Event system
  EventSubscriber,
  EventSource,
  EventBoundary,
  identityBoundary,
  appendSubscriber,
  removeSubscriber,
  subscribeEvent,
  emitEvent,
}
```

### 2. **Read Operations**

```typescript
export enum ConsumerReadMode {
  lazy = 1 << 0,    // Lazy: stabilize only when read
  eager = 1 << 1,   // Eager: stabilize immediately (untracked)
}

export function readProducer<T>(
  node: ReactiveNode<T>,
  context?: ExecutionContext,
): T
  // PURPOSE: Read a producer (source) node value
  // TRACKING: Registers a dependency if called during active computation
  // INVARIANT: Always returns current/valid payload
  // COST: O(1)

export function readConsumer<T>(
  node: ReactiveNode<T>,
  mode?: ConsumerReadMode,
  context?: ExecutionContext,
): T
  // PURPOSE: Read a computed (derived) node value
  // STABILIZATION: Ensures value is up-to-date before returning
  //   - lazy mode: stabilize in current context, register dependency
  //   - eager mode: stabilize untracked, no dependency registration
  // INVARIANT: Always returns valid/current payload
  // COST: O(n) where n = number of dirty ancestors + dependencies to recompute
  
export function untracked<T>(
  fn: () => T,
  context?: ExecutionContext,
): T
  // PURPOSE: Execute code without registering read dependencies
  // EFFECT: Clears context.activeComputed during execution
  // USE: Explicit opt-out of dependency tracking
  // INVARIANT: No edges created from reads within untracked()
```

### 3. **Write Operations**

```typescript
export function writeProducer<T>(
  node: ReactiveNode<T>,
  value: T,
  context?: ExecutionContext,
): void
  // PURPOSE: Commit new value to a producer (source) node
  // CHANGE DETECTION: Uses compare() to detect if value changed
  // IF CHANGED:
  //   1. Sets node.payload = value
  //   2. Clears dirty bits (node.state &= ~DIRTY_STATE)
  //   3. Immediately propagates to all subscribers via propagate(firstOut, IMMEDIATE)
  // IF UNCHANGED:
  //   - Returns early, no propagation
  // INVARIANT: All subscribers are notified synchronously before writeProducer returns
  // COST: O(n) where n = nodes transitively subscribed to this producer
```

### 4. **Watcher/Observer Operations**

```typescript
export function runWatcher<T>(
  compute: () => T,
  onInvalidation?: (cleanup: () => void) => void,
  context?: ExecutionContext,
): () => void
  // PURPOSE: Create an observer that re-executes when dependencies change
  // TRACKING: Runs compute() immediately, registers all reads as dependencies
  // INVALIDATION: When a dependency changes:
  //   1. Re-executes compute() function
  //   2. Calls onInvalidation callback (if provided) before next execution
  //   3. Allows cleanup registration via callback parameter
  // RETURNS: dispose() function to stop watching and cleanup
  // INVARIANT: compute() is executed at least once before runWatcher returns

export function disposeWatcher(
  watcher: ReactiveNode,
  context?: ExecutionContext,
): void
  // PURPOSE: Dispose a watcher and unregister all dependencies
  // EFFECT: Sets Disposed flag, breaks all edges, prevents future execution
  // INVARIANT: Subsequent reads from this watcher's dependencies no longer register it
```

### 5. **State Constants (Public)**

```typescript
export const DIRTY_STATE = 
  ReactiveNodeState.Invalid | ReactiveNodeState.Changed

export const PRODUCER_INITIAL_STATE = ReactiveNodeState.Producer
export const PRODUCER_CHANGED = 
  ReactiveNodeState.Producer | ReactiveNodeState.Changed
export const PRODUCER_DIRTY = 
  ReactiveNodeState.Producer | DIRTY_STATE

export const CONSUMER_CHANGED = 
  ReactiveNodeState.Changed | ReactiveNodeState.Consumer
export const CONSUMER_DIRTY = 
  ReactiveNodeState.Consumer | DIRTY_STATE

export const WATCHER_CHANGED = 
  ReactiveNodeState.Changed | ReactiveNodeState.Watcher
export const WATCHER_INITIAL_STATE = WATCHER_CHANGED

export const WALKER_STATE = 
  ReactiveNodeState.Visited | ReactiveNodeState.Tracking
```

---

## Node Model & Types

### ReactiveNode Structure

```typescript
class ReactiveNode<T = unknown> {
  // STATE BYTE: Compact bitfield encoding node kind and dirty/computed status
  state: number
  
  // COMPUTATION: User function that produces the node's value
  compute: ComputeFn<T> | null
  
  // PAYLOAD: The cached value (for producers and computed nodes)
  payload: T
  
  // OUTGOING EDGES: Subscribers who read from this node (doubly-linked list)
  firstOut: ReactiveEdge | null
  lastOut: ReactiveEdge | null
  
  // INCOMING EDGES: Nodes this one depends on (doubly-linked list)
  firstIn: ReactiveEdge | null
  lastIn: ReactiveEdge | null
  
  // DEPENDENCY CURSOR: Points to the last edge during dependency tracking
  // Used to optimize edge reuse and detect unused dependencies
  depsTail: ReactiveEdge | null
}
```

**Memory Layout Optimization:**
- All fields are carefully ordered for cache locality
- `state` is a single byte (bit-packed) for compact representation
- Doubly-linked lists avoid garbage collection for edge allocation

### ReactiveEdge Structure

```typescript
interface ReactiveEdge {
  // IDENTITY: What this edge connects
  from: ReactiveNode    // Producer/source node
  to: ReactiveNode      // Consumer/dependent node
  
  // OUTGOING LIST: Siblings in source's subscriber list
  prevOut: ReactiveEdge | null
  nextOut: ReactiveEdge | null
  
  // INCOMING LIST: Siblings in consumer's dependency list
  prevIn: ReactiveEdge | null
  nextIn: ReactiveEdge | null
}
```

**Invariant: Bidirectional Consistency**
- Every edge exists in BOTH lists simultaneously
- Modifications must keep both views in sync
- Breaking this invariant causes memory leaks and traversal errors

### Node Kind Flags

```typescript
enum ReactiveNodeState {
  // KIND (mutually exclusive within computation lifecycle)
  Producer  = 1 << 0,   // Source of mutation (1)
  Consumer  = 1 << 1,   // Pure derived computation (2)
  Watcher   = 1 << 2,   // Observer with side-effects (4)
  
  // DIRTY STATE (mutually exclusive within single dirty bit)
  Invalid   = 1 << 3,   // "Maybe changed" - needs verification (8)
  Changed   = 1 << 4,   // "Definitely changed" - confirmed (16)
  
  // TRANSIENT (temporary state during execution)
  Visited   = 1 << 5,   // Used during walk to mark path (32)
  Disposed  = 1 << 6,   // Node is dead, edges broken (64)
  Computing = 1 << 7,   // Currently executing compute() (128)
  Scheduled = 1 << 8,   // Pending execution in scheduler (256)
  Tracking  = 1 << 9,   // Currently accepting dependency reads (512)
}
```

**Dirty State Semantics:**
- `Changed` = upstream definitely changed (e.g., signal.set(newValue))
- `Invalid` = upstream might have changed (e.g., transitive dirty propagation)
- Never both simultaneously in healthy graph
- Both cleared together: `state &= ~DIRTY_STATE`

---

## Execution Context

### ExecutionContext Interface

```typescript
interface ExecutionContext {
  // ACTIVE NODE: The node currently executing its compute() function
  // null = no active computation (running at top level or in untracked())
  activeComputed: ReactiveNode | null
  
  // HOOKS: Customization points for the host (scheduler, lifecycle, etc.)
  hooks?: EngineHooks
  
  // CLEANUP: Register finalizers when nodes are disposed
  cleanupRegistrar?: CleanupRegistrar
  
  // INTERNAL: State management for propagation and settlement
  enterPropagation(): void
  leavePropagation(): void
  maybeNotifySettled(): void
  dispatchWatcherEvent(watcher: ReactiveNode): void
}
```

### EngineHooks

```typescript
interface EngineHooks {
  // Called when a computed node becomes invalid and needs scheduling
  scheduleCompute?(node: ReactiveNode): void
  
  // Called when any computation settles (all dirty propagation complete)
  onSettle?(): void
  
  // Called when a watcher changes and needs re-execution
  scheduleWatcher?(watcher: ReactiveNode): void
}
```

**Context Lifecycle:**
1. Create context: `const ctx = createExecutionContext()`
2. Set as default: `setDefaultContext(ctx)` (for convenience)
3. Pass to API functions: `readProducer(node, ctx)`
4. Reset if needed: `resetDefaultContext()`

---

## Implementation Mechanics

### 1. Write Path: Producer Value Update

```
User code:
  writeProducer(signal, newValue)
    │
    ├─ compare(oldValue, newValue)
    │  └─ if equal: return early (no propagation)
    │
    ├─ node.payload = newValue
    ├─ node.state &= ~DIRTY_STATE  (clear previous dirty bits)
    │
    ├─ if (node.firstOut === null) return  (no subscribers, done)
    │
    └─ context.enterPropagation()
       └─ propagate(node.firstOut, IMMEDIATE, context)
          └─ [See Propagation Walker below]
       └─ context.leavePropagation()
```

**Guarantees:**
- ✅ Compare detects true changes (handles NaN, === for objects)
- ✅ Payload committed before subscriber notification
- ✅ All subscribers notified synchronously before function returns
- ✅ Each subscriber marked with Changed state (promotes Invalid to Changed)
- ✅ No compute functions called during propagate (that's read's job)

### 2. Read Path: Consumer Stabilization

```
User code:
  const value = readConsumer(computed, mode)
    │
    ├─ stabilizeConsumer(computed)
    │  │
    │  ├─ if (state & DIRTY_STATE === 0) 
    │  │  └─ return cached payload (already valid)
    │  │
    │  ├─ if (state & Changed)
    │  │  └─ needs recompute (upstream definitely changed)
    │  │
    │  └─ else (Invalid)
    │     └─ shouldRecompute(computed)  [See Walker below]
    │        └─ pull-side walk to confirm actual change
    │
    │  if (needs recompute):
    │     └─ recompute(computed)
    │        ├─ executeNodeComputation()
    │        │  ├─ clear depsTail & Tracking flag
    │        │  ├─ context.activeComputed = computed
    │        │  ├─ result = compute()  (may register dependencies)
    │        │  ├─ trackRead(dep) for each read  [See Tracking below]
    │        │  ├─ cleanupStaleSources()  (unlink unused deps)
    │        │  └─ context.activeComputed = prev
    │        │
    │        ├─ changed = compare(oldPayload, result)
    │        ├─ node.payload = result
    │        ├─ node.state &= ~DIRTY_STATE
    │        │
    │        └─ return changed
    │
    │     if (changed && hasFanout(fromEdge)):
    │        └─ propagateOnce(computed)  (notify siblings)
    │
    └─ return payload
```

**Guarantees:**
- ✅ Returned value is always current (stale dirty state impossible)
- ✅ Dependency changes detected (via Changed flag OR pull-walk confirmation)
- ✅ Sibling subscribers notified if this computed changed (fanout prevention)
- ✅ User compute() function re-executed minimally

### 3. Dependency Tracking: During Compute

```
while executing compute():
  readProducer(source)
    └─ trackRead(source)
       │
       ├─ consumer = context.activeComputed  (the function that's running)
       ├─ if (!consumer) return  (not in active computation)
       │
       ├─ prevEdge = consumer.depsTail
       │
       ├─ if (prevEdge === null)
       │  └─ reuseOrCreateIncomingEdge(source, consumer, null, firstIn)
       │     ├─ search existing edges: firstIn, then walk nextIn
       │     ├─ if found: move to depsTail position (reuse)
       │     └─ if not found: create new edge and insert at depsTail
       │
       ├─ else (depsTail !== null)
       │  ├─ if (prevEdge.from === source) return  (same as last read, skip)
       │  │
       │  ├─ if (prevEdge.nextIn?.from === source)
       │  │  └─ advance cursor to next  (linear scan optimization)
       │  │
       │  └─ else
       │     └─ reuseOrCreateIncomingEdge(source, consumer, prevEdge, nextExpected)
       │        (cursor-guided search, reorder edge into active prefix)
       │
       └─ consumer.depsTail = newEdge
```

**Optimization: Cursor-Based Tracking**
- `depsTail` caches the last read edge (usually same or nearby next time)
- Linear scan from prevEdge instead of from firstIn (hot path)
- Found edges are moved to active prefix (recent re-reads stay hot)

**Cleanup: After Compute**

```
cleanupStaleSources(consumer):
  tail = consumer.depsTail
  if (tail === null)
     staleHead = consumer.firstIn  (all edges are old)
  else
     staleHead = tail.nextIn  (everything after cursor is old)
  
  if (staleHead !== null):
     └─ unlink entire stale sequence from consumer
        ├─ Break prevIn pointers of first edge
        ├─ Break nextIn pointers of tail edge
        └─ Break outgoing edges from producers
           (so producer no longer sees consumer as subscriber)
```

**Guarantee:** No memory leak from old dependencies; edges removed atomically.

---

## Walkers: Deep Dive

### Overview: Two-Phase Change Propagation

The runtime uses a sophisticated two-phase approach:

1. **Push Phase (Propagate):** Producer notifies subscribers synchronously
   - Fast, shallow, determines *which* nodes to recompute
   - Uses `IMMEDIATE` flag to promote `Invalid → Changed` for eager subscribers
   - Does NOT call compute functions

2. **Pull Phase (ShouldRecompute):** Lazy consumers verify if recompute needed
   - Walks dependency tree depth-first
   - Confirms actual change vs. stale dirty flag
   - Only calls compute if confirmed change

This decoupling allows:
- ✅ Batching: Multiple writes, single re-execution pass
- ✅ Lazy evaluation: Unread computed nodes never execute
- ✅ Minimal recomputes: Only re-execute if upstream *actually* changed

---

### Walker 1: Propagate (Push Phase)

**Location:** `src/reactivity/walkers/propagate.ts`

**Entry Points:**
```typescript
export const NON_IMMEDIATE = 0
export const IMMEDIATE = 1

export function propagateOnce(
  node: ReactiveNode,
  context: ExecutionContext,
): void
  // Shallow, single-level promotion
  // Loop through node.firstOut..lastOut subscribers
  // Promote Invalid→Changed for each
  // Return

export function propagate(
  startEdge: ReactiveEdge,
  promoteImmediate = NON_IMMEDIATE,
  context: ExecutionContext,
): void
  // Deep traversal of entire dirty subtree
  // Called with firstOut edge of changed node
```

**State Machine: Propagate Decision Tree**

```
For each edge from source to subscriber:
  
  1. Fast path check:
     if (state & (DIRTY_STATE | Disposed | WALKER_STATE) === 0)
        → Already clean or disposed, skip (not in dirty set)
  
  2. Slow path (if fast check fails):
     if (Disposed) → skip (node marked for deletion)
     if (Tracking) → special handling (re-entrant read during compute)
        if (edge not in tracked prefix)
           → skip (dependency was dropped)
        else
           → mark Visited | Invalid (re-entrant path marker)
  
  3. Promotion (if not skipped):
     if (Invalid):
        state |= Changed  (promote: might change → definitely changed)
     
     if (Watcher):
        dispatchWatcherEvent(sub)  (notify observer to re-execute)
     else:
        firstOut = sub.firstOut
        if (firstOut !== null):
           propagate(firstOut)  (recurse to subscribers)
```

**Critical Detail: IMMEDIATE vs NON_IMMEDIATE**

```typescript
const nextState =
  (state & INVALIDATION_SLOW_PATH_MASK) === 0
    ? state | (promote ? ReactiveNodeState.Changed : ReactiveNodeState.Invalid)
    : getSlowInvalidatedSubscriberState(edge, state, promote)
```

- `IMMEDIATE = 1`: Promote Invalid→Changed (used for direct subscribers of changed node)
- `NON_IMMEDIATE = 0`: Only mark Invalid (used for transitive subscribers)

**Reason for Two Modes:**

```
Graph: A (producer) → B (computed) → C (computed)

scenario: A changes
  
  propagate(A→B, IMMEDIATE):  B is direct subscriber, confirm change
    B.state |= Changed  (not just Invalid)
    B.compute() will re-execute
  
  propagate(B→C, NON_IMMEDIATE):  C is transitive, needs verification
    C.state |= Invalid  (might change, depends on B's new value)
    When C is read → shouldRecompute(C) will verify
```

**Traversal Strategy: Branching vs Linear**

```
propagate(edge, promote, context):
  
  ├─ Linear path (single subscriber):
  │  └─ Loop while next edge exists
  │     └─ No stack allocation, tight loop
  │     └─ Best for: chains A→B→C→D
  │
  └─ Branching path (multiple subscribers):
     └─ Recursion + explicit stack for DFS
     └─ Handles: A→{B,C,D} fanouts
     └─ Switch triggered when edge.nextOut exists
```

**Key Optimization: `promoteInvalidSubscriber()`**

```typescript
function promoteInvalidSubscriber(node: ReactiveNode): boolean {
  const state = node.state
  
  if ((state & DIRTY_STATE) !== ReactiveNodeState.Invalid) 
    return false  // Already Changed or Clean
  
  node.state = (state & ~Invalid) | Changed
  return true  // Promoted, proceed with notification
}
```

Only subscribers in `Invalid` state can be promoted. If already `Changed`, they're already queued for recompute.

**Re-entrance Handling: `isTrackedPrefixEdge()`**

```
If compute() is called and reads a dependency while that dependency is being
invalidated (rare but possible), we need to detect if the edge is in the
"active dependency prefix" (depsTail chain).

Invariant: If a dependency is being read, it was active when compute started.
If propagate() is walking and finds Computing flag, it checks:
  - Is this edge before or after depsTail?
  - If before: keep it (it was definitely read)
  - If after: drop it (it became inactive)
```

---

### Walker 2: ShouldRecompute (Pull Phase)

**Location:** `src/reactivity/walkers/shouldRecompute.ts`

**Entry Point:**

```typescript
export function shouldRecompute(node: ReactiveNode): boolean
  // Return true if any upstream value changed
  // Return false if all dirty flags were stale
  
  // Preconditions:
  // - node must be in (Invalid | Changed) state
  // - node must be Consumer (not Producer, not Watcher)
  // - caller will recompute if returns true
```

**Purpose: Distinguish Real Changes from False Alarms**

```
Scenario 1: Signal.set(42), then Signal.set(42)
  - First write: marks all consumers Invalid
  - Second write: same value, propagate aborts early
  - Consumers still Invalid, but nothing changed
  - shouldRecompute() returns false, saves recompute

Scenario 2: Dependency depth-first tree
         A (Changed)
        / \
       B   C (both Invalid)
      /
     D (Invalid)
  
  When D is read:
  - D marked Invalid, but did upstream actually change?
  - shouldRecompute(D) walks D→B→A
  - Checks A first (ancestor): is A Changed?
  - If yes: B might have changed → need to recompute B to know if D changed
  - Cascades upward until confirmed change OR all paths verified clean
```

**State Machine: Dependency Walk**

```
shouldRecompute(node):
  
  ├─ if (Producer) → return false
  │  (producers commit eagerly on write, no verification needed)
  │
  ├─ if (Changed) → return true
  │  (already confirmed changed in propagate phase)
  │
  ├─ if (Invalid & Visited & Tracking)
  │  → return true
  │  (re-entrant: compute() saw stale value before propagate reached it)
  │
  ├─ if (firstIn === null)
  │  → return false  (no dependencies, can't change, no recompute)
  │
  └─ shouldRecomputeLinear(node, firstIn)  [See below]
     └─ Depth-first walk of dependency tree
```

**Walker: shouldRecomputeLinear()**

```
Initialize:
  stack = []
  link = firstIn  (start with first dependency)
  consumer = node
  changed = false

Loop:
  ┌─ For each incoming edge (dependency):
  │
  ├─ dep = link.from
  ├─ depState = dep.state
  │
  ├─ Case 1: consumer already marked Changed
  │  └─ changed = true
  │  └─ break (no need to check others)
  │
  ├─ Case 2: dep marked Changed
  │  └─ refreshDependency(link, dep)
  │     └─ if Producer: just read state, clear bits, return (state & Changed)
  │     └─ else: recompute(dep), compare(old, new), return changed
  │  │
  │  └─ if changed && hasFanout(link)
  │     └─ propagateOnce(dep)  (notify sibling deps)
  │  │
  │  └─ break (confirmed change)
  │
  ├─ Case 3: dep NOT Changed, but dep NOT Producer, and dep IS Dirty
  │  └─ dep might be invalid due to unknown changes deeper
  │  └─ if (dep.firstIn !== null)
  │     └─ Descend: push current link to stack, walk dep's dependencies
  │     └─ link = dep.firstIn, consumer = dep
  │     └─ continue
  │  └─ else (no deps)
  │     └─ refreshDependency(link, dep)  (force recompute to know if changed)
  │
  ├─ Case 4: dep NOT Dirty (Clean)
  │  └─ clearInvalid(consumer)
  │  └─ Check next dependency (link.nextIn)
  │
  └─ Move to next dependency or backtrack from stack

Return:
  └─ changed flag (true = needs recompute, false = still valid)
```

**Sub-function: refreshDependency()**

```typescript
function refreshDependency(link, dep, state = dep.state): boolean {
  
  if ((state & Producer) !== 0) {
    // Producer: just read the Changed flag
    dep.state = state & ~DIRTY_STATE  (clear dirty bits)
    return (state & Changed) !== 0
  }
  
  // Consumer: must recompute to get new value
  changed = recompute(dep, context)
  
  // If dep has fanout (multiple subscribers) and changed:
  if (changed && hasFanout(link)) {
    propagateOnce(dep, context)  (notify siblings of change)
  }
  
  return changed
}
```

**Sub-function: hasFanout()**

```typescript
function hasFanout(link: ReactiveEdge): boolean {
  return link.prevOut !== null || link.nextOut !== null
}
```

Why check fanout?
- Single subscriber: parent will eventually read this dep
- Multiple subscribers: siblings might miss change, need propagateOnce

**Critical Optimization: Linear Fast Path**

```
if (link.nextIn === null) {
  // Only one dependency, use linear (no branching)
  return shouldRecomputeLinear(...)  // No stack needed
}
else {
  // Multiple dependencies, use branching
  return shouldRecomputeBranching(...)  // Explicit stack for DFS
}
```

This avoids stack allocation when dependency tree is linear.

---

### Key Invariant: Visited Flag Semantics

```
VISITED flag marks the path walked during shouldRecompute().

Why needed?
- Re-entrance detection: if compute() reads a dependency while that
  dependency's ancestors are being walked for change verification
- Marks "prefix" of dependency path that was definitely visited
- If new read outside visited prefix, it's a truly new dependency

State during walk:
  - node.state |= Visited | Invalid  (marks path)
  
  if (isTrackedPrefixEdge(edge, depsTail)):
    → edge is in active dependency list, keep Invalid state
  else:
    → edge was dropped after tracking started, skip (return 0)

After walk completes:
  - Visited cleared (state &= ~Visited)
```

---

### Fanout Promotion: propagateOnce()

```
After shouldRecompute/refreshDependency confirms a dependency changed,
if that dependency has multiple subscribers, call propagateOnce():

propagateOnce(node, context):
  ├─ for each edge in node.firstOut..lastOut
  │  └─ sub = edge.to
  │  └─ if (sub.state & Invalid):
  │     └─ sub.state |= Changed  (promote)
  │     └─ if (Watcher) dispatchWatcherEvent(sub)
  │
  └─ return

Why? Prevent sibling consumers from missing change:

  Graph:
    A (producer) → [writes newVal]
                   └─ propagate(IMMEDIATE)
                      B (computed) → [reads A, might change]
                                    ↓
                                    propagateOnce(B)
                                      ├─ C (computed, Invalid)
                                      │  └─ Changed (promote immediately)
                                      └─ D (computed, Invalid)
                                         └─ Changed (promote immediately)

  Without propagateOnce: C and D stay Invalid, might not recompute when B changed.
  With propagateOnce: C and D see Changed flag, will recompute when read.
```

---

### Walk Complexity Analysis

| Operation | Complexity | Notes |
|-----------|-----------|-------|
| propagate(single) | O(n) | n = transitive subscribers |
| propagate(fanout) | O(n) | Uses branching stack for DFS |
| shouldRecompute | O(m) | m = depth of dep tree * fanout |
| trackRead | O(k) | k = cursor distance or 1 (hot path) |
| cleanupStaleSources | O(s) | s = stale dependencies to unlink |

---

## Invariants & Guarantees

### ★ Critical Invariants (Must Never Break)

#### 1. **Edge Bidirectional Consistency**
```
Invariant: Every edge exists in exactly TWO lists simultaneously
  - In source's outgoing list (prevOut/nextOut)
  - In target's incoming list (prevIn/nextIn)

Violation consequence: Memory leak, traversal errors, cycles

Operations that touch edges:
  - createReactiveEdge()
  - reuseOrCreateIncomingEdge()
  - unlinkDetachedIncomingEdgeSequence()
  - unlinkOutgoingEdgeSequence()

Rules:
  1. When inserting: update both lists at same time
  2. When removing: clear both directions simultaneously
  3. When walking: never modify other direction's pointers
```

#### 2. **Dirty State Validity**
```
Invariant: At most ONE of {Invalid, Changed} is set at any time
  - (state & (Invalid | Changed)) in {0, Invalid, Changed}
  - Never: (state & Invalid) && (state & Changed) simultaneously

Violation consequence: Ambiguous semantics, wrong recompute decisions

Safe operations:
  - state |= Changed    (set Changed only, Invalid implicitly false)
  - state |= Invalid    (set Invalid only)
  - state &= ~DIRTY_STATE    (clear both)

Unsafe:
  - state |= (Invalid | Changed)    ❌ Don't do this
```

#### 3. **Computing Flag Exclusivity**
```
Invariant: Computing flag is set ONLY during execute() call
  - Set at start: markNodeComputing(node)
  - Cleared at end: clearNodeComputing(node)
  - MUST be cleared even if exception thrown (use finally)

Violation consequence: Deadlock, cycle detection broken

Rule:
  - Never set Computing and read from node simultaneously
  - Cycle detection: if (Computing & requested read) → error
```

#### 4. **Disposed Node Immutability**
```
Invariant: Once Disposed flag is set, node must not participate in
  - Dependency tracking (trackRead returns early if consumer disposed)
  - Propagation (propagate skips subscribers with Disposed)
  - Recomputation (never recompute a disposed node)

Consequence of violation: Ghost edges from dead nodes, memory leaks

Safe patterns:
  1. disposeNode() sets Disposed
  2. All edges unlinked
  3. compute set to null
  4. No further operations on this node reference
```

#### 5. **depsTail Cursor Validity**
```
Invariant: depsTail always points to an edge in consumer.firstIn..lastIn
  
Special states:
  - depsTail === null: not currently tracking (execute not running)
  - depsTail === firstIn: only first edge was read this cycle
  - depsTail === lastIn: all deps are reused
  - depsTail.nextIn === null: cursor at end

After execute() completes:
  - All edges BEFORE depsTail are reused (kept)
  - All edges AFTER depsTail are stale (unlinked)

Violation consequence: Wrong dependency cleanup, memory leak

Safe operation:
  - Only set depsTail during Tracking phase (execute)
  - Reset to null after execute completes (before return)
```

#### 6. **Context.activeComputed Accuracy**
```
Invariant: context.activeComputed === currently executing node
  - null when no compute() is running
  - Set at start of execute()
  - MUST be restored in finally block
  - nested execute() → stack activeComputed

Violation consequence: trackRead drops dependencies, wrong graph structure

Safe pattern:
  const prev = context.activeComputed
  context.activeComputed = node
  try {
    // execute
  } finally {
    context.activeComputed = prev
  }
```

#### 7. **Change Confirmation Ordering**
```
Invariant: A node can only change if at least one dependency changed
  - if (node.state & Changed) → at least one dep.state & Changed
  - Corollary: no spontaneous changes without upstream change

Violation consequence: Wrong invalidation, false positives

Guarantee: propagate() only sets Changed if source changed
Guarantee: shouldRecompute() verifies upstream actually changed
```

#### 8. **Propagation Completeness**
```
Invariant: When propagate() returns, ALL subscribers reachable from
  start edge have been notified

This is guaranteed by:
  1. While-loop covers all edges (nextOut chaining)
  2. Recursive descent into each subscriber
  3. Branching stack ensures no lost branches
  4. No early returns except in skip cases

Verification: After propagate(), scanning from start should reach
  all transitive subscribers; all have Updated state
```

#### 9. **Watcher Ordering Guarantee**
```
Invariant: Watchers are always executed in the order they received
  invalidation events from propagate()

Implementation:
  - propagate() collects watchers in depth-first order
  - For each watcher found, dispatchWatcherEvent() called synchronously
  - No queuing; immediate execution
  - Watcher exceptions collected and re-thrown after all watchers

Consequence: Watchers see consistent graph state during execution
```

#### 10. **Cleanup Callback Timing**
```
Invariant: Cleanup callbacks from runWatcher() must execute:
  1. BEFORE next watcher execution (if invalidated)
  2. BEFORE watcher disposal
  3. AFTER previous execution settled

Violation consequence: Resource leaks, use-after-free in cleanup code

Safe pattern:
  runWatcher(
    compute: () => {
      const resource = acquire()
      return { resource }
    },
    onInvalidation: (cleanup) => {
      cleanup(() => release(resource))
    }
  )
```

---

### ✓ Strong Guarantees (Maintained by Implementation)

#### Consistency Guarantee
**After any API call returns, the reactive graph is consistent:**
- All dirty flags are accurate
- No edges are orphaned
- Computing flag is cleared
- activeComputed is null (if called from top-level)

#### Determinism Guarantee
**Same inputs always produce same outputs (for same compute functions):**
- No randomness in propagation order (depth-first deterministic)
- No randomness in walk order (firstIn→lastIn deterministic)
- No race conditions (synchronous execution only)

#### Acyclicity Guarantee
**The dependency graph is always a DAG (no cycles):**
- Cycle detection via Computing flag (reject reads from same node)
- Prevents A → B → A → (infinite loop)
- Checked during trackRead(), throws on violation

#### Completeness Guarantee
**All changes propagate to all affected nodes:**
- propagate() visits all reachable subscribers
- shouldRecompute() visits all reachable dependencies
- Watchers see notifications for all their invalidations

#### Minimalism Guarantee
**Compute functions are called minimally:**
- Only for Changed or invalidated nodes that are actually read
- Only if upstream actually changed (shouldRecompute verification)
- Not called for disposed or unreachable nodes

---

## State Transition Rules

### Node Lifecycle State Machine

```
Initial State (depends on node kind):
  Producer      → Producer
  Consumer      → Consumer
  Watcher       → Consumer | Watcher

Transitions during execute():
  + Tracking flag (set at start)
  + Computing flag (set at start)
  - Tracking flag (cleared at end)
  - Computing flag (cleared at end)
  
Transitions during dirty propagation:
  Invalid → Changed (if promoted by propagate IMMEDIATE)
  Changed → Changed (idempotent)
  Any → Visited | Invalid (if re-entrant read during compute)

Transitions during cleanup:
  Any state → Disposed (node death)
  [After Disposed: no further state changes]

Safe state combinations (non-exclusive):
  {Producer | Consumer | Watcher} & 
  {Invalid | Changed | 0} & 
  {Visited | 0} & 
  {Disposed | 0} & 
  {Computing | 0} & 
  {Scheduled | 0} & 
  {Tracking | 0}

Forbidden combinations:
  ✗ Invalid & Changed (both dirty bits)
  ✗ Producer & Consumer (mutually exclusive kinds)
  ✗ Producer & Watcher (mutually exclusive kinds)
  ✗ Disposed & {Computing, Tracking} (dead nodes shouldn't execute)
  ✗ Computing & changed from outside (no async state changes during execute)
```

### Dirty State Progression

```
Clean State:
  state & DIRTY_STATE === 0

Invalidated (via propagate):
  state |= Invalid  OR  state |= Changed

Invalid State:
  state & Invalid ≠ 0  AND  state & Changed === 0
  
  Actions:
    - readConsumer() → shouldRecompute() to verify
    - If verified: recompute() → clear DIRTY_STATE
    - If not verified: clearInvalid() → back to Clean

Changed State:
  state & Changed ≠ 0  AND  state & Invalid === 0
  
  Actions:
    - readConsumer() → immediate recompute (no verification)
    - recompute() → clear DIRTY_STATE
    - Watchers: dispatchWatcherEvent() on propagate

Transition: Invalid → Changed
  Method: promoteInvalidSubscriber() in propagate
  Condition: promoteImmediate === IMMEDIATE
  Effect: Skips shouldRecompute verification
```

---

### Execute Cycle: State Transitions

```
Before execute():
  node.state & Tracking === 0
  node.state & Computing === 0
  node.depsTail === null

Start of execute():
  node.depsTail = null
  node.state |= Tracking    (ready to accept trackRead)
  node.state |= Computing   (cycle detection)
  context.activeComputed = node

During compute():
  trackRead(dep) for each read
    - Finds/creates edge from dep to node
    - Updates depsTail cursor
  
  [If re-entrant invalidation:
    - propagate() sees Computing flag
    - Marks Visited | Invalid if in tracked prefix
    - These are handled in shouldRecompute phase
  ]

End of execute():
  context.activeComputed = prev
  node.state &= ~Tracking   (reject new trackRead)
  node.state &= ~Computing  (cycle detection complete)
  
  cleanupStaleSources(node):
    - Everything after depsTail is unlinked
    - Producers unlinked too (removed from their outgoing lists)

After execute():
  node.depsTail === null  (cursor reset)
  node.firstIn..lastIn === active dependencies only
  All outgoing subscribers have node in their incoming list
  
  [Dirty bits state depends on whether value changed:
    - changed? clear DIRTY_STATE (will be set again if dependency changes)
    - not changed? DIRTY_STATE kept if was Invalid (retry verification later)
  ]
```

---

## Summary: Critical Implementation Principles

1. **Push-then-Pull Propagation**
   - Push phase marks nodes that might have changed
   - Pull phase confirms via dependency walk
   - Decouples notification from re-execution

2. **Lazy Evaluation**
   - Compute functions only run when read
   - Saves computation for unused nodes
   - Combined with Changed flag for eagerness

3. **Deterministic Ordering**
   - Depth-first traversal of both propagation and dependency walk
   - Firstly-in-first-out edge ordering
   - Same inputs always produce same order

4. **Edge Bidirectionality**
   - Each edge appears in both source's outgoing and target's incoming
   - Must keep both synchronized
   - Enables efficient traversal in both directions

5. **State Atomicity**
   - Each API call leaves graph in consistent state
   - No partial state updates
   - Exceptions handled with finally blocks

6. **Visitor Pattern for Walks**
   - Visited flag marks traversal path
   - Enables re-entrance detection
   - Prevents duplicate processing

7. **Cursor-Based Tracking**
   - depsTail caches last read dependency
   - Enables hot-path optimization
   - Expected case: re-read same dependencies

This design enables:
- ✅ Minimal recomputes (pull-phase verification)
- ✅ Batching support (push-phase decoupling)
- ✅ Lazy evaluation (read-triggered stabilization)
- ✅ Deterministic execution (DFS ordering)
- ✅ Memory efficiency (edge pooling, no GC-heavy structures)
- ✅ Debuggability (explicit state machine, no hidden state)
