# Maintaining @reflex/runtime

This guide is for developers modifying the runtime core. It explains how to approach changes safely and what to watch for.

---

## Quick Start: Before You Change Anything

### 1. Read These Documents (in order)

1. **[README.md](./README.md)** — 10 min — mental model
2. **[RUNTIME.md](./RUNTIME.md)** — 20 min — public contract
3. **[INVARIANTS.md](./INVARIANTS.md)** — 20 min — what can break
4. **[src/reactivity/walkers/README.md](./src/reactivity/walkers/README.md)** — 15 min — algorithm overview
5. **[study/04-read-and-write-paths.md](./study/04-read-and-write-paths.md)** — 30 min — control flow

### 2. Run the Tests

```bash
cd packages/@reflex/runtime
pnpm test                              # All unit tests
pnpm test -- --reporter=verbose        # See each test
pnpm test -- runtime.walkers.test.ts   # Core algorithm tests
pnpm test -- runtime.semantic.test.ts  # Correctness tests
```

All should pass. If not, understand what's breaking before making changes.

### 3. Pick Your File

Use this map to find the right place:

| Goal | Primary Files | Related |
|------|---------------|---------|
| Change write path | `src/api/write.ts` + `src/reactivity/walkers/propagate.ts` | RUNTIME.md |
| Change read path | `src/api/read.ts` + `src/reactivity/walkers/recompute.ts` | 04-read-and-write-paths.md |
| Change tracking | `src/reactivity/engine/tracking.ts` | 05-dynamic-dependencies.md |
| Change watcher behavior | `src/api/watcher.ts` + `src/reactivity/walkers/` | 06-effects-and-scheduler.md |
| Change disposal | `src/reactivity/index.ts` | DISPOSE.md |
| Change context | `src/reactivity/context.ts` | 07-execution-contexts.md |

---

## Typical Change Scenarios

### Scenario 1: Optimize a Hot Path

**Example:** Make `writeProducer()` faster

**Steps:**

1. **Measure first:** Run `pnpm bench:core` to establish baseline
2. **Profile:** Identify the bottleneck in `src/reactivity/walkers/propagate.ts`
3. **Verify correctness:** Write test case that will catch regressions
4. **Implement:** Make the change
5. **Test:** Run `pnpm test` — all tests must pass
6. **Benchmark:** Run `pnpm bench:core` again, compare
7. **Check invariants:** Verify you haven't broken [INVARIANTS.md](./INVARIANTS.md) items 1–4

---

### Scenario 2: Fix a Bug (Semantic)

**Example:** Stale values still appearing

**Steps:**

1. **Create a minimal test case** that reproduces the bug
2. **Add to `tests/runtime.semantic.test.ts`** so it fails today
3. **Read the relevant docs:**
   - If: wrong invalidation → check INVARIANTS #2 (Changed vs. Invalid)
   - If: stale edges → check INVARIANTS #3 (Pruning)
   - If: disposed participation → check INVARIANTS #5 (Disposal terminal)
4. **Locate the bug** using the invariant as a guide
5. **Implement fix** minimally (don't refactor while fixing)
6. **Test:** Verify your test now passes; run full suite
7. **Document:** Update relevant .md files if behavior changed

---

### Scenario 3: Add a Feature (e.g., Custom Comparator)

**Example:** Allow users to provide custom equality check

**Steps:**

1. **Update public API:** Modify `src/api/` to accept new parameter
2. **Thread it through:** Pass parameter down to where it's used
3. **Update RUNTIME.md** to document the new behavior
4. **Add tests:** Create test case covering the feature
5. **Check invariants:** Ensure none are violated
6. **Verify backward compatibility:** Old code should still work
7. **Benchmark:** If hot path affected, run `pnpm bench:core`

---

## Testing Discipline

### Unit Tests

```bash
pnpm test -- runtime.walkers.test.ts
```

Tests the core algorithms:
- Edge creation/removal
- Propagation correctness
- Recomputation logic
- Dependency tracking

**When to add:** Any change to `src/reactivity/walkers/` or `src/reactivity/engine/`

### Semantic Tests

```bash
pnpm test -- runtime.semantic.test.ts
```

Tests observable behavior:
- Stale values
- Cleanup ordering
- Re-entrancy safety
- Context isolation

**When to add:** Any change affecting user-visible behavior

### Regression Tests

```bash
pnpm test -- runtime.walkers_reggression.dev.test.ts
```

Tests specific invariants:
- Bidirectional edge consistency
- Disposal terminal state
- Dynamic dependency pruning

**When to add:** When fixing a specific bug (to prevent reoccurrence)

### Quick Command: Run All Relevant Tests

```bash
pnpm test -- --grep "walker|semantic|regression"
```

---

## Common Pitfalls

### Pitfall 1: Breaking Bidirectional Edges

**Symptom:** Tests pass, but in production, graph traversal visits wrong nodes

**Prevention:**

- Every `edge.add()` must update **both** `firstOut`/`lastOut` **and** `firstIn`/`lastIn`
- Every `edge.remove()` must unlink from **both** chains
- Run: `tests/runtime.traversal.test.ts`

**Check:**

```ts
// In your code, if you write:
source.firstOut = edge;  // <-- don't forget
edge.to.firstIn = edge;  // <-- this too!
```

### Pitfall 2: Confusing Changed and Invalid

**Symptom:** Consumers sometimes return stale values

**Prevention:**

- `Changed` = recompute immediately
- `Invalid` = verify via `shouldRecompute()` first
- Test with `readConsumer()` after different write scenarios

**Check INVARIANTS.md #2**

### Pitfall 3: Stale Dependencies Not Pruned

**Symptom:** Consumer marked dirty from unrelated branches

**Prevention:**

- After `recompute()`, call `unlinkStaleSuffix()`
- `depsTail` must be set correctly at recompute start
- Run: `tests/runtime.semantic.test.ts` (specifically branch-switching cases)

**Check INVARIANTS.md #3 and #4**

### Pitfall 4: Disposed Nodes Still Participate

**Symptom:** Effects fire after component unmount

**Prevention:**

- Every public operation: check `if (isDisposedNode(node)) return early`
- In `propagate()`: skip disposed nodes
- In cleanup: fully unlink disposed nodes

**Check INVARIANTS.md #5**

### Pitfall 5: Cleanup Runs in Wrong Order

**Symptom:** Resource double-release or state corruption

**Prevention:**

- In `runWatcher()`: run previous cleanup **before** new compute
- In `disposeWatcher()`: run cleanup exactly once
- Write tests that verify order

**Check INVARIANTS.md #6**

---

## Performance-Sensitive Zones

### Zone 1: `src/reactivity/walkers/propagate.ts`

**Why:** Runs on every `writeProducer()`

**Cost model:**
- Should be O(number of direct subscribers)
- Linear edge traversal
- No sorting, no priority queue

**Optimization opportunities:**
- Minimize allocations (use edge chain instead of array)
- Avoid function calls in inner loop
- Benchmark: `pnpm bench:core` → measure write latency

### Zone 2: `src/reactivity/walkers/recompute.ts`

**Why:** Runs on every `readConsumer()`

**Cost model:**
- Should be O(number of dependencies that changed)
- `shouldRecompute()` verifies each upstream
- Only recompute if needed

**Optimization opportunities:**
- Avoid re-checking already-verified consumers
- Early exit in `shouldRecompute()` if any upstream changed
- Benchmark: `pnpm bench:core` → measure read latency

### Zone 3: `src/reactivity/engine/tracking.ts`

**Why:** Runs during every `compute()`

**Cost model:**
- Should be O(number of reads performed)
- Edge reuse via `depsTail` cursor
- `depsTail` saves edge allocations

**Optimization opportunities:**
- Fast path for reusing same edge
- Minimize edge allocation for new deps
- Benchmark: `tracking-cleanup-matrix.jit.mjs`

### Zone 4: Context Lookup

**Why:** Every operation accepts `context?`

**Cost model:**
- Should be O(1) — context is a reference
- Avoid context allocation per operation

**Optimization opportunities:**
- Use default context when possible
- Don't create new context per operation
- Use shared context for a "world"

---

## Benchmarking

### Run Core Benchmarks

```bash
pnpm build:perf
pnpm bench:core
```

Outputs performance metrics for:
- `writeProducer()` latency
- `readConsumer()` latency
- Propagation fanout
- Tracking cleanup

### Run Specific Benchmark

```bash
pnpm build:perf
node dist/perf.js --filter propagate-stack
```

### Interpret Results

- **Baseline:** First run on unmodified code
- **After change:** Second run with your modification
- **Regression:** If latency increased, investigate

Key metrics:
- `propagate-stack-compare.jit.mjs` — write performance
- `tracking-cleanup-matrix.jit.mjs` — dependency tracking
- `repeated-read-branching.jit.mjs` — read performance

---

## Debug Mode

### Enable Debug Output

```bash
NODE_DEBUG=@reflex/* pnpm test -- runtime.semantic.test.ts
```

This activates:
- `src/debug.impl.ts` — detailed logging
- `src/debug_flag.ts` — feature flags
- Execution event capture

### Use Introspection API

```ts
import { subtle } from "@reflex/runtime/debug";

// Label a node for debugging
subtle.label(node, "myConsumer");

// Get node state snapshot
const snap = subtle.snapshot(node);
console.log(snap);

// Get execution history
const history = subtle.history(ctx);
console.log(history);
```

### Development Assertions

Dev builds include extra checks (see `src/debug_flag.ts`):

```bash
NODE_ENV=development pnpm test
```

Production build strips them.

---

## Code Organization

### File Map

```
src/
  api/
    read.ts          ← readProducer, readConsumer, readConsumerLazy, readConsumerEager
    write.ts         ← writeProducer
    watcher.ts       ← runWatcher, disposeWatcher
    index.ts         ← public exports
  
  reactivity/
    context.ts       ← ExecutionContext, hooks, propagation depth
    index.ts         ← ReactiveNode, state constants
    
    engine/
      compute.ts     ← executeNodeComputation
      execute.ts     ← compute execution, dependency initialization
      tracking.ts    ← trackRead, depsTail cursor logic
      watcher.ts     ← watcher-specific execution
    
    shape/
      Reactivable.ts         ← Node state enum
      ReactiveEdge.ts        ← Edge structure
      ReactiveNode.ts        ← Node structure
      ReactiveMeta.ts        ← Metadata storage
      methods/               ← Internal helpers
    
    walkers/
      propagate.ts           ← Main push invalidation
      propagate.once.ts      ← Reentrant-safe variant
      propagate.constants.ts ← State tokens
      recompute.ts           ← Pull stabilization orchestration
      recompute.refresh.ts   ← Actual compute execution
      recompute.branch.ts    ← Branch switching, stale cleanup
```

### Dependency Graph (simplified)

```
api/*
  ↓
reactivity/context.ts
  ↓
reactivity/engine/*
  ↓
reactivity/walkers/*
  ↓
reactivity/shape/*
```

Avoid circular dependencies. If adding a new file, fit it into this hierarchy.

---

## Before Committing

### Pre-Commit Checklist

- [ ] Tests pass: `pnpm test`
- [ ] No console warnings: `NODE_DEBUG="" pnpm test`
- [ ] Benchmarks not regressed: `pnpm bench:core` (if hot path changed)
- [ ] Invariants checked: Read through [INVARIANTS.md](./INVARIANTS.md), confirm none broken
- [ ] Docs updated: If behavior changed, update README.md, RUNTIME.md, or study/
- [ ] No dead code: Ensure no unused functions
- [ ] TypeScript clean: `pnpm build:ts` has no errors

### Pre-Review Checklist

- [ ] Clear commit message explaining **why** (not just what)
- [ ] Linked any related issues
- [ ] Added test case(s) for the change
- [ ] Pinned down invariant(s) in comments if touching critical path

---

## Escalation: When to Ask for Help

| Situation | Action |
|-----------|--------|
| Test fails mysteriously | Run with `--reporter=verbose`, check invariants |
| Performance regressed | Run benchmark, profile with DevTools |
| Disposed node behavior wrong | Review [DISPOSE.md](./DISPOSE.md) |
| Watcher not executing | Check `onEffectInvalidated` hook firing |
| Circular reference leak | Check bidirectional edges (INVARIANTS #1) |
| Stale values appearing | Check `shouldRecompute()` logic (INVARIANTS #2) |

---

## Related Resources

- **[DOC-TOPOLOGY.md](./DOC-TOPOLOGY.md)** — Doc navigation roadmap
- **[study/README.md](./study/README.md)** — Detailed learning path
- **[DISPOSE.md](./DISPOSE.md)** — Disposal semantics
- **[INVARIANTS.md](./INVARIANTS.md)** — Engineering contract
- **Tests:** `tests/runtime.*.test.ts` — executable specification
- **Benchmarks:** `tests/perf/*.jit.mjs` — performance baselines
