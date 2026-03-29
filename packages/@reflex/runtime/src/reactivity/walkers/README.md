# Reflex Runtime: Walkers & Invariants - Examples & Diagrams

This document provides concrete examples, state diagrams, and visual walkthroughs of the two core walker algorithms and critical invariants.

---

## Example 1: Simple Push-Pull Flow

### Code:
```typescript
const signal = createProducer(0)
const doubled = createConsumer(() => readProducer(signal) * 2)
const watcher = runWatcher(() => {
  console.log('doubled:', readConsumer(doubled))
})

writeProducer(signal, 5)  // Change happens here
```

### Execution Timeline:

```
State BEFORE writeProducer(signal, 5):

  Node graph:
    signal(0) ──out──→ doubled ──out──→ watcher
    doubled ──in──→ signal
    watcher ──in──→ doubled

  States:
    signal.state:  Producer
    doubled.state: Consumer
    watcher.state: Watcher

─────────────────────────────────────────────────────────────────

Step 1: writeProducer(signal, 5)

  1.1 Compare check:
      previous = signal.payload = 0
      value = 5
      changed = !compare(0, 5) = true
  
  1.2 Update payload:
      signal.payload = 5
      signal.state &= ~DIRTY_STATE  (nothing to clear, already clean)
  
  1.3 Check subscribers:
      signal.firstOut = edge(signal → doubled)  ≠ null
      → need to propagate
  
  1.4 enterPropagation()
      context.propagationDepth++

─────────────────────────────────────────────────────────────────

Step 2: propagate(edge(signal → doubled), IMMEDIATE, context)

  [This is the PUSH PHASE: notify all subscribers]
  
  2.1 Linear traversal start:
      propagateLinear(startEdge, IMMEDIATE, context)
      
      edge = edge(signal → doubled)
      promote = IMMEDIATE (1)
  
  2.2 First iteration: Process doubled
      sub = doubled
      state = doubled.state = Consumer (no dirty bits)
      
      Fast path check:
        (state & INVALIDATION_SLOW_PATH_MASK) === 0
        = (Consumer & (DIRTY | Disposed | WALKER_STATE)) === 0
        = true ✓ (use fast path)
      
      nextState = state | (promote ? Changed : Invalid)
                = Consumer | Changed
                = CONSUMER_CHANGED
      
      doubled.state = CONSUMER_CHANGED
      recordPropagation(...)  [debug only]
      
      if ((nextState & Watcher) !== 0)  → false, skip
      
      firstOut = doubled.firstOut = edge(doubled → watcher)  ≠ null
      
      next = edge.nextOut = null
      
      Since next === null and firstOut !== null:
        edge = firstOut
        promote = NON_IMMEDIATE (0)  [transitive subscribers don't auto-promote]
        continue
  
  2.3 Second iteration: Process watcher
      sub = watcher
      state = watcher.state = Watcher (no dirty bits)
      
      Fast path: true ✓
      
      nextState = Watcher | Invalid  (NON_IMMEDIATE, so Invalid)
                = WATCHER_INITIAL_STATE (which includes Changed by definition)
                = Watcher | Changed
      
      watcher.state = WATCHER_CHANGED
      recordPropagation(...)
      
      if ((nextState & Watcher) !== 0)  → true
        → dispatchWatcherEvent(watcher, context)
           [call watcher's compute function asynchronously or immediately]
      
      firstOut = watcher.firstOut = null  (watcher has no subscribers)
      next = edge.nextOut = null
      
      Both null → exit loop
  
  2.4 Return from propagateLinear
      All subscribers notified

─────────────────────────────────────────────────────────────────

Step 3: leavePropagation()

  context.propagationDepth--

State AFTER writeProducer completes:

  signal.state:  Producer | 0 (clean)
  signal.payload: 5
  
  doubled.state: Consumer | Changed ← marked for recompute
  doubled.payload: 0 (still old value, not yet recomputed)
  
  watcher.state: Watcher | Changed
  watcher.compute: pending execution

─────────────────────────────────────────────────────────────────

Step 4: When doubled is read (readConsumer):

  The PULL PHASE begins
  
  4.1 stabilizeConsumer(doubled, context)
      state = CONSUMER_CHANGED
      
      if ((state & DIRTY_STATE) !== 0)  → true (has Changed flag)
        
        if ((state & Changed) !== 0)  → true
          needs = true  (skip shouldRecompute, confirmed changed)
        
        if (needs):
          recompute(doubled, context)
          
            4.2 executeNodeComputation(doubled):
                
                doubled.depsTail = null
                doubled.state = (state & ~Visited) | Tracking
                             = (Consumer | Changed & ~Visited) | Tracking
                             = Consumer | Changed | Tracking
                
                markNodeComputing(doubled)
                doubled.state |= Computing
                           = Consumer | Changed | Tracking | Computing
                
                context.activeComputed = doubled
                
                result = compute():
                  → readProducer(signal, context)
                     │
                     └─ trackRead(signal, context)
                        consumer = context.activeComputed = doubled
                        prevEdge = doubled.depsTail = null
                        firstIn = doubled.firstIn = edge(signal → doubled)
                        
                        if (firstIn.from === signal)  → true
                          doubled.depsTail = firstIn
                          (reuse existing edge!)
                          return
                    
                    value = signal.payload = 5
                    return 5 * 2 = 10
                
                cleanupStaleSources(doubled):
                  tail = doubled.depsTail = edge(signal → doubled)  ≠ null
                  staleHead = tail.nextIn = null
                  (no stale edges to unlink)
                
                context.activeComputed = prev = null
                clearNodeComputing(doubled)
                doubled.state &= ~Computing
                           = Consumer | Changed | Tracking
                
                node.state &= ~Tracking
                         = Consumer | Changed
                
                return committed value
            
            4.3 back in recompute():
                prev = old value = 0
                result = 10
                changed = !compare(0, 10) = true
                
                doubled.payload = 10  ← UPDATE PAYLOAD
                doubled.state &= ~DIRTY_STATE
                           = Consumer  (clean again)
                
                if (changed && hasFanout(fromEdge))
                  hasFanout(edge(signal → doubled))
                    = edge.prevOut !== null || edge.nextOut !== null
                    = false || false = false
                  (single subscriber, no fanout)
                
                return changed = true
          
          if (changed):
            propagateOnce(doubled, context)  [not called, !hasFanout]
  
  4.4 trackRead(doubled, context)
      consumer = context.activeComputed = null (no active compute)
      → return early (only track during active compute)
  
  return doubled.payload = 10

─────────────────────────────────────────────────────────────────

Final State:

  signal.state:  Producer
  signal.payload: 5
  
  doubled.state: Consumer (clean)
  doubled.payload: 10 ← updated!
  
  watcher.state: Watcher | Changed
  watcher.payload: awaiting execution

  Dependency edges: unchanged
    signal → doubled
    doubled → watcher
```

---

## Example 2: Change Verification via shouldRecompute

### Scenario: False Change Alarm

```typescript
const toggle = createProducer(false)
const toggled = createConsumer(() => !readProducer(toggle))
const even = createConsumer(() => {
  const t = readConsumer(toggled)
  return t ? 42 : 42  // Same value regardless!
})

console.log(readConsumer(even))  // 42

// Now toggle (false → true):
writeProducer(toggle, true)  // Invalidates both toggled and even

// But when even is read:
console.log(readConsumer(even))  // Should still be 42 (no recompute needed!)
```

### Execution Timeline:

```
Initial state:
  toggle.payload = false
  toggle.state = Producer
  
  toggled.payload = true  (computed from !false)
  toggled.state = Consumer
  toggled.depsTail = edge(toggle → toggled)
  
  even.payload = 42
  even.state = Consumer
  even.depsTail = edge(toggled → even)

─────────────────────────────────────────────────────────────────

writeProducer(toggle, true):

  1. compare(false, true) → false (different!)
  2. toggle.payload = true
  3. propagate(toggle→toggled, IMMEDIATE):
     
     toggled.state |= Changed
     
     propagate(toggle→even, NON_IMMEDIATE):  [transitive, so Invalid not Changed]
       even.state |= Invalid

State after write:
  toggle.payload = true
  toggle.state = Producer
  
  toggled.payload = true  (still old)
  toggled.state = Consumer | Changed ← will recompute
  
  even.payload = 42  (still old)
  even.state = Consumer | Invalid ← needs verification

─────────────────────────────────────────────────────────────────

readConsumer(even):

  stabilizeConsumer(even):
    state = Consumer | Invalid
    
    if ((state & DIRTY_STATE) !== 0)  → true
      
      if ((state & Changed) !== 0)  → false (not Changed, just Invalid)
      
      else:
        needs = shouldRecompute(even)
        
        ──────────────────────────────
        WALKER: shouldRecompute(even)
        ──────────────────────────────
        
        1. Check state:
           - (state & Producer) === 0  ✓ (is Consumer)
           - (state & Changed) === 0   ✓ (not Changed)
           - (state & Invalid) !== 0   ✓ (is Invalid)
           
           → Proceed to walk
        
        2. shouldRecomputeLinear(even, even.firstIn):
           
           Initialize:
             link = even.firstIn = edge(toggled → even)
             consumer = even
             changed = false
           
           First iteration:
             link.nextIn === null  (only one dependency)
             → stay on linear path
             
             Check consumer state:
               (even.state & Changed) === 0  ✓ (not changed yet)
             
             dep = link.from = toggled
             depState = toggled.state = Consumer | Changed
             
             Case check:
               (depState & Changed) !== 0  → true!
               
               → refreshDependency(link, toggled, depState)
               
                  ┌─────────────────────────────────────────
                  │ REFRESHING toggled
                  ├─────────────────────────────────────────
                  
                  toggled.state & Producer === 0
                  → Not a producer, must recompute
                  
                  recompute(toggled):
                    prev = toggled.payload = true  (old value)
                    
                    executeNodeComputation(toggled):
                      context.activeComputed = toggled
                      
                      result = compute():
                        → readProducer(toggle)
                           return toggle.payload = true
                        return !true = false
                      
                      toggled.payload = false  ← new value
                      context.activeComputed = null
                    
                    changed = !compare(true, false) = true
                    toggled.state &= ~DIRTY_STATE
                               = Consumer
                    return true  ← TOGGLED CHANGED
                  
                  changed = true  (from refreshDependency)
                  
                  hasFanout(link)?
                    edge.prevOut = edge(toggled → even)? No, null
                    edge.nextOut = ?              No, null
                    → false (single subscriber)
                  
                  → no propagateOnce needed
               
               break  (confirmed upstream change)
           
           Return changed = true
        
        ─────────────────────────────
        End shouldRecompute
        ─────────────────────────────
        
        needs = true
      
      if (needs):
        recompute(even):
          prev = even.payload = 42
          
          executeNodeComputation(even):
            context.activeComputed = even
            
            result = compute():
              → readConsumer(toggled)
                 
                 [stable_consumer called again, but already clean now]
                 toggled.state = Consumer (clean)
                 (state & DIRTY_STATE) === 0 → return 42
                 
                 return 42
            
            → no dependency change in even (toggled clean on re-read)
          
          changed = !compare(42, 42) = false  ← NO CHANGE
          even.payload = 42  (same value)
          even.state &= ~DIRTY_STATE = Consumer (clean)
          return false  ← no propagateOnce
        
        if (changed):  → false, skip
      
      else:  → change was false
        clearInvalid(even)?  → No, recompute succeeded
    
    return even.payload = 42

Result: readConsumer(even) returns 42, but WITHOUT re-executing the outer
        computation! The toggle change was detected, toggled was recomputed,
        but even's computation wasn't called (no external observable change).

COMPARISON TO NAIVE APPROACH:
        
  ✗ Naive: mark Invalid on write → always recompute on read
    Result: even would be recomputed, wastefully
  
  ✓ Reflex: mark Invalid → shouldRecompute walks deps → confirms change
    Result: only recompute what actually feeds new values
```

---

## Example 3: Fanout Propagation

### Scenario: Multiple Subscribers Need Promotion

```typescript
const source = createProducer(1)

const double = createConsumer(() => readProducer(source) * 2)
const triple = createConsumer(() => readProducer(source) * 3)

const sum = createConsumer(() => 
  readConsumer(double) + readConsumer(triple)
)

writeProducer(source, 2)  // Source changes
```

### Graph Before Write:

```
source(1)
  ├─ out ──→ double ──out──→ sum
  └─ out ──→ triple ──out──┘

source.firstOut = edge(source → double)
                        .nextOut = edge(source → triple)

Incoming:
double.firstIn = edge(source → double)
triple.firstIn = edge(source → triple)
sum.firstIn = edge(double → sum)
sum.firstIn.nextIn = edge(triple → sum)
```

### Execution: writeProducer(source, 2)

```
Step 1: propagate(source.firstOut, IMMEDIATE)
        Edge: source → double

        sub = double
        state = Consumer
        
        Fast path: true
        nextState = Consumer | Changed
        double.state = Consumer | Changed
        
        firstOut = edge(double → sum)  ≠ null
        next = edge.nextOut = edge(source → triple)  ≠ null
        
        → Branching! Stack-backed DFS
           return propagateBranching(
             edge(double → sum),
             NON_IMMEDIATE,
             edge(source → triple),
             IMMEDIATE,  ← remember this is direct subscriber
             context
           )

Step 2: Inside propagateBranching:

        Stack: [
          (edge(source → triple), IMMEDIATE)
        ]
        
        Process edge(double → sum):
          sub = sum
          state = Consumer
          
          Fast path: true
          nextState = Consumer | Invalid  (NON_IMMEDIATE from double)
          sum.state = Consumer | Invalid
          
          firstOut = sum.firstOut = null  (sum has no subscribers)
          next = edge.nextOut = null
          
          Since firstOut === null and resume !== null:
            Pop stack:
              resume = null
              stackTop = -1
              edge = edge(source → triple)
              promote = IMMEDIATE
          
          Continue main loop with this edge

Step 3: Process edge(source → triple):

        sub = triple
        state = Consumer
        
        Fast path: true
        nextState = Consumer | Changed  (IMMEDIATE from source)
        triple.state = Consumer | Changed
        
        firstOut = edge(triple → sum)  ≠ null
        next = edge.nextOut = null
        
        → Descend into firstOut
           edge = edge(triple → sum)
           promote = NON_IMMEDIATE  (transitive)

Step 4: Process edge(triple → sum):

        sub = sum
        state = Consumer | Invalid  (marked in Step 2!)
        
        Fast path check:
          (state & INVALIDATION_SLOW_PATH_MASK)
          = (Consumer | Invalid) & (DIRTY | Disposed | WALKER)
          = Invalid ≠ 0  → Slow path!
        
        getSlowInvalidatedSubscriberState(edge, state, NON_IMMEDIATE):
          (state & (DIRTY | Disposed)) === 0  ✓ (just Invalid)
          (state & Tracking) === 0  ✓ (not computing)
          
          → Check edge in tracked prefix?
             (no tracked prefix, not computing)
             
             → return Invalid  (keep Invalid, don't promote)
        
        nextState = Invalid
        sum.state = Consumer | Invalid  (unchanged)
        
        → This is the KEY: triple is CHANGED but sum stays INVALID
           Why? Because sum reads from BOTH double and triple.
           We need to ensure sum knows about BOTH changes when recomputed.

State after propagate:

  double.state = Consumer | Changed ← changed, will recompute
  triple.state = Consumer | Changed ← changed, will recompute
  sum.state = Consumer | Invalid    ← needs verification

When sum is read:

  shouldRecompute(sum):
    edge = sum.firstIn = edge(double → sum)
    
    dep = double
    depState = Consumer | Changed
    
    → changed = refreshDependency(edge, double)
       double.state & Producer === 0  (is computed)
       recompute(double):
         result = 2 * 2 = 4  (was 2, source changed)
         changed = true
       return true
    
    hasFanout(edge)?
      edge = edge(double → sum)
      edge.prevOut = null  (first outgoing from double)
      edge.nextOut = edge(double→...) or null
      
      Actually: double's only subscribers is sum, so false
      → no propagateOnce needed
    
    changed = true → break
    
    return true
  
  needs = true → recompute(sum):
    result = 4 + (readConsumer(triple))
    
    Which re-triggers shouldRecompute for triple:
      triple.state = Consumer | Changed
      → needs = true (confirmed changed via Changed flag)
      → recompute(triple):
           result = 2 * 3 = 6  (was 3, source changed)
           changed = true
      
      return 6
    
    sum = 4 + 6 = 10
    sum.payload = 10  (was 5)
    changed = true
    return true
  
  return sum.payload = 10

FANOUT BENEFIT:

If double had promoted sum to Changed immediately in Step 2:
  sum.state = Consumer | Changed
  
Then when triple's read was being processed, sum wouldn't notice triple changed.
Keeping sum as Invalid forces re-verification via shouldRecompute, ensuring
both upstream changes are visible.

NO FANOUT (sum.firstOut = null) → propagateOnce not called
BUT STILL SAFE because shouldRecompute walks all incoming edges.
```

---

## Example 4: Re-entrance & Visited Flag

### Scenario: Dependency Changes While Compute is Running

```typescript
const flag = createProducer(false)

const flagValue = createConsumer(() => readProducer(flag))

const computed = createConsumer(() => {
  const f = readConsumer(flagValue)
  
  // While we're in this compute(), flagValue invalidates!
  // But depsTail has flagValue, so it's in tracked prefix
  
  // After we return, flagValue might recompute with new source value
  // That change must be visible to us
  
  return f ? 'yes' : 'no'
})

// Simulate re-entrant invalidation:
// 1. computed starts executing
// 2. reads flagValue (dependency established)
// 3. depsTail = edge(flagValue → computed)
// 4. Meanwhile, flag changes and propagates
// 5. flagValue marked Invalid, but computed still Computing
```

### Execution:

```
Timeline:
  
  (1) computed is being read for first time
      readConsumer(computed)
      → stabilizeConsumer → recompute(computed)
      → executeNodeComputation(computed)
        context.activeComputed = computed
        computed.state |= Computing | Tracking
  
  (2) Inside compute() execution:
      readConsumer(flagValue)
      → stabilizeConsumer → computed already valid
      → trackRead(flagValue):
        consumer = computed
        prevEdge = computed.depsTail = null
        firstIn = computed.firstIn = null  (first read)
        
        → reuseOrCreateIncomingEdge:
          create edge(flagValue → computed)
          computed.firstIn = edge
          computed.depsTail = edge
        
        return 'yes'  (assuming flagValue = true)
  
  (3) WHILE STILL IN COMPUTE:
      [Some async event or same-frame re-entrancy?]
      writeProducer(flag, true)  ← flag changes
      
      → propagate(flag.firstOut, IMMEDIATE)
        → flagValue.state |= Changed
        → propagate(flagValue.firstOut, NON_IMMEDIATE)
          
          sub = computed
          state = computed.state = Consumer | Computing | Tracking
          
          Fast path check:
            (state & INVALIDATION_SLOW_PATH_MASK)
            = (Consumer | Computing | Tracking)
              & (DIRTY | Disposed | WALKER_STATE)
            = Tracking ≠ 0  → Slow path!
          
          getSlowInvalidatedSubscriberState(...):
            (state & (DIRTY | Disposed)) === 0  ✓
            (state & Tracking) !== 0  → true (Computing!)
            
            → isTrackedPrefixEdge(edge, depsTail)?
              edge = edge(flagValue → computed)
              depsTail = edge(flagValue → computed)
              
              edge === depsTail  → true!  (same edge)
              
              → return state | Visited | Invalid
            
            nextState = Consumer | Computing | Tracking | Visited | Invalid
          
          computed.state |= (Visited | Invalid)
  
  (4) Back in computed's execute() after compute() finishes:
      
      return 'yes'
      
      cleanupStaleSources(computed):
        tail = computed.depsTail = edge(flagValue → computed)
        staleHead = tail.nextIn = null
        → no stale sources
      
      context.activeComputed = prev
      computed.state &= ~Tracking
      computed.state &= ~Computing
                   = Consumer | Visited | Invalid
      
      committed = compare(result, previous)
      
      return committed

  (5) Back in stabilizeConsumer:
      state = Consumer | Visited | Invalid
      
      if ((state & DIRTY_STATE) !== 0)  → true (has Invalid)
        
        if ((state & Changed) !== 0)  → false
        
        else:
          if ((state & Invalid) !== 0 && (state & WALKER_STATE))
             → (Invalid ≠ 0 && Visited ≠ 0)  → true
            
            → needs = true  (re-entrant marker detected!)
            → recompute(computed):
                
                context.activeComputed = computed
                computed.state |= Computing | Tracking
                
                flagValue MIGHT have changed since last read
                
                result = compute():
                  readConsumer(flagValue)
                  
                  flagValue.state might be Changed from step (3)
                  → stabilizeConsumer will recompute it
                  → readConsumer returns possibly new value
                
                return result

```

**Why This Matters:**

If we didn't have the Visited flag:
- computed reads flagValue in step (2) → gets old value 'yes'
- Meanwhile flagValue changed in step (3)
- computed finishes compute() → returns 'yes' based on old state
- Later when code reads computed → returns stale 'yes'

With Visited flag:
- Step (3) marks Visited | Invalid
- Step (4) sees Visited flag after compute
- Forces re-execution to get new value
- Step (5) returns fresh result based on new flagValue

---

## Critical Invariant Violations & Consequences

### Violation 1: Breaking Edge Bidirectionality

```typescript
// WRONG: Only update outgoing list, forget incoming
edge.nextOut = nextEdge  ← outgoing link broken
// edge.nextIn not updated ← incoming link still has old pointer

Consequence:
  - When walking incoming edges, encounter stale edge
  - Edge might point to disposed node
  - Edge might cause duplicate processing
  - Memory leak: orphaned edge never freed
```

### Violation 2: Invalid & Changed Both Set

```typescript
node.state |= (Invalid | Changed)  ← both dirty bits set

Consequence:
  - propagate() sets Changed flag
  - stabilizeConsumer() reads Changed flag
  - Assumes upstream definitely changed (skips shouldRecompute)
  - But Invalid flag suggests uncertainty
  - Ambiguous semantics → wrong decision
```

### Violation 3: Computing Flag Not Cleared

```typescript
try {
  result = compute()
} finally {
  // OOPS: forgot to clearNodeComputing(node)
}

Consequence:
  - Next time node is read, trackRead happens
  - compute() tries to read that node again
  - Cycle detection sees Computing flag → throws error
  - Runtime becomes unusable
```

### Violation 4: Disposed Node Still Has Edges

```typescript
disposeNode(node)  → sets Disposed flag
// But forget to unlink edges

Later:
  subscriber reads from disposed node
  → trackRead doesn't notice Disposed (should return early)
  → Creates ghost edge to dead node
  → Dead node never executes but consumes memory
  → References to disposed node through edges prevent GC
```

### Violation 5: Watcher Executes Multiple Times Per Change

```typescript
// In propagate(), for each watcher found:
dispatchWatcherEvent(watcher)  ← execute once
// But forgot to mark Scheduled flag

Later:
  Same watcher found again in same propagate
  → dispatchWatcherEvent(watcher) called AGAIN
  → Effect runs twice for single change
```

### Violation 6: depsTail Points Outside firstIn..lastIn

```typescript
// After execute(), depsTail should point to active edges or null

But what if:
  computed.firstIn = edge(A → computed)
  computed.depsTail = edge(C → computed)  ← not connected!
  computed.lastIn = edge(B → computed)

Consequence:
  - cleanupStaleSources(computed) uses depsTail as stale boundary
  - Tries to set depsTail.nextIn = null  → segfault (dangling pointer)
  - Or misidentifies stale edges → memory leak
```

---

## State Diagram: Consumer Lifecycle

```
Start:
  [Clean State]
     state = Consumer
     payload = undefined or initial

                ↓
         (dependency written)
         
[Dirty → Changed]:
  state |= Changed
  state |= Invalid (transitive, not direct)

                ↓
         (readConsumer)
         (stabilizeConsumer)
         
[Recomputing]:
  state |= Computing
  state |= Tracking
  (execute function)

                ↓
         (compute() finishes)
         
[Committed]:
  state &= ~Computing
  state &= ~Tracking
  payload = new value
  state &= ~DIRTY_STATE (clean again)

                ↓
         (dependency written again)
         
     (back to Changed/Invalid)


Special case: Re-entrance
             
[Computing & Invalid]:
  During compute, a dependency invalidates
  state |= Visited | Invalid (marker)
  
                ↓
         (compute() finishes)
         
  Sees Visited flag → forced re-execution
  
                ↓
     Back to [Recomputing]


End state: Disposed
  state |= Disposed
  payload = final value (archived)
  compute = null
  edges = unlinked
  (no further state changes)
```

---

## Summary Table: When Each Walker Runs

| Event | Walker | Purpose | Cost |
|-------|--------|---------|------|
| `writeProducer(val)` | propagate | Notify subscribers of change | O(subscribers) |
| `readConsumer()` (Changed) | — | Skip verification, recompute | O(compute) |
| `readConsumer()` (Invalid) | shouldRecompute | Verify upstream change | O(deps * depth) |
| `readConsumer()` (Visited) | — | Force recompute after re-entrant | O(compute) |
| `recompute()` | trackRead | Register dependencies | O(1) amortized |
| After `compute()` | cleanupStaleSources | Unlink unused deps | O(stale deps) |
| `disposeNode()` | — | Mark Disposed, break edges | O(edges) |

---

## Key Takeaway: Two-Phase Separation

**Push Phase (Synchronous, Shallow)**
- `writeProducer()` → propagate() → marks subscribers dirty
- Doesn't execute any compute functions
- Cheap: O(n) where n = direct + transitive subscribers
- Deterministic: always same depth-first order

**Pull Phase (Lazy, Deep)**
- `readConsumer()` → stabilizeConsumer() → shouldRecompute()
- Verifies actual change, executes compute functions
- Expensive: O(k) where k = dependencies to check
- Only when explicitly read
- With confirmation walk: no false recomputes

**Consequence:**
- Single producer write can trigger multiple readers
- Readers batch their checks
- Minimal recomputes (only confirmed changes)
- Deterministic execution (same read order = same results)
