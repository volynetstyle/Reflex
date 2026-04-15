# @reflex/runtime Study Guide

This folder contains deep-dive explanations of the low-level runtime architecture, designed for maintainers and contributors.

**Important:** This is **not** high-level framework documentation. It assumes you are reading the `src/` code and want to understand the current algorithms and design decisions.

---

## Intended Audience

- **Runtime maintainers** — modifying core engine files
- **Contributors** — extending with custom propagation, tracking, or disposal logic
- **Curious integrators** — understanding what "under the hood" really means
- **Performance debuggers** — hunting for hot paths and optimization opportunities

---

## Reading Order

Follow this sequence for a complete understanding:

### Foundation (Understand the Model)

1. **[01-basics.md](./01-basics.md)** `✓ Current`
   - Producer, consumer, watcher distinction
   - Why push invalidation + pull stabilization?
   - Lazy evaluation strategy
   - Mental model: spreadsheet cells vs. formulas

2. **[02-public-api.md](./02-public-api.md)** `✓ Current`
   - What the package exports
   - How to use each primitive
   - Context and hook integration
   - Practical patterns

### Core Architecture (Know the Data Structures)

3. **[03-core-model.md](./03-core-model.md)** `✓ Current`
   - `ReactiveNode` structure and fields
   - Bidirectional edges (`firstIn`/`lastIn`, `firstOut`/`lastOut`)
   - State bits and dirty tracking
   - `depsTail` cursor and dependency reuse
   - Execution context ownership

### Algorithms (Understand Control Flow)

4. **[04-read-and-write-paths.md](./04-read-and-write-paths.md)** `🔄 Needs Refresh`
   - `writeProducer` — commit and propagate
   - `readConsumer` — stabilization and verification
   - `shouldRecompute` vs. `recompute` phases
   - `propagate` — cheap invalidation pass
   - Push/pull interaction

5. **[05-dynamic-dependencies.md](./05-dynamic-dependencies.md)** `🔄 Needs Refresh`
   - `trackRead` — dependency registration
   - Dependency reorder during recompute
   - Stale-suffix cleanup after recompute
   - Branch switching semantics
   - Re-entrancy and dependency mutation

### Effects and Lifecycle (Know the Boundaries)

6. **[06-effects-and-scheduler.md](./06-effects-and-scheduler.md)** `⚠️ Historical` — See [07-execution-contexts.md](./07-execution-contexts.md)
   - **Warning:** Partially outdated architecture; context was globalized in earlier version
   - Still useful for understanding watcher semantics and why scheduler is not built-in
   - Modern context model: see [07-execution-contexts.md](./07-execution-contexts.md)
   - Watcher protocol and cleanup ordering

7. **[07-execution-contexts.md](./07-execution-contexts.md)** `✓ Current`
   - Execution context lifecycle
   - Hook management and propagation depth
   - Active computation tracking
   - Context-local cleanup registration

### Invariants (Know What Can't Break)

8. **[07-invariants-dev-and-prod.md](./07-invariants-dev-and-prod.md)** `🔄 Needs Refresh`
   - Critical invariants (bidirectional edges, disposal terminal, etc.)
   - Development assertions vs. production behavior
   - Invariant enforcement in tests
   - Regression patterns

### Performance (Know the Hot Paths)

9. **[08-performance.md](./08-performance.md)** `🔄 Needs Refresh`
   - Cost model: what's cheap, what's expensive
   - Hot path identification in `src/reactivity/`
   - Memory considerations
   - Optimization targets and trade-offs
   - Benchmark interpretation

### Extension Points (Know Where to Customize)

10. **[09-extension-guide.md](./09-extension-guide.md)** `🔄 Needs Refresh`
    - Safe seams for extending runtime behavior
    - What can be changed vs. what will break invariants
    - Custom propagation strategies
    - Custom tracking policies
    - Common pitfalls

### Source Navigation (Know the Map)

11. **[10-source-map.md](./10-source-map.md)** `🔄 Needs Refresh`
    - File organization in `src/`
    - Dependency graph between modules
    - Where to find specific functionality
    - Recommended reading order for code
    - Key entry points

---

## Status Legend

| Status | Meaning | Action |
|--------|---------|--------|
| `✓ Current` | Accurate, maintained | Safe to rely on |
| `🔄 Needs Refresh` | Mostly correct, minor updates needed | Read but cross-check with code |
| `⚠️ Historical` | Describes old architecture | Background context only; see newer docs |
| `❌ Outdated` | Inaccurate for current code | Skip; use other sources |

---

## The Current Runtime Model

### Control Flow

```
writeProducer(value)
  → (synchronously)
  → propagate() — mark subscribers Invalid/Changed
  → onEffectInvalidated() hook — watcher invalidation signals
  → (host decides when to proceed)
  → readConsumer() — stabilize and verify
  → recompute() if needed
  → unlink stale dependencies

runWatcher()
  → (host decides when)
  → (actually executes the effect)
  → cleanup() before next run or on disposal
```

### Key Differences from Previous Versions

**Old model:** `epoch`, `t/v/s/w` state tokens, `ensureFresh()`, monolithic `walkers.ts`

**Current model:**
- Role encoded in state bits (Producer, Consumer, Watcher)
- Dirty protocol: `Invalid` / `Changed` (not `Obsolete`)
- Pull-side: `shouldRecompute()` + `recompute()` pipeline
- Dynamic deps: `depsTail` cursor + edge reorder (not epoch-based)
- Split modules: `walkers/`, `tracking.ts`, `engine/`

---

## Before You Modify the Runtime

### Read These First

1. **Start with:** `study/01-basics.md` + `study/03-core-model.md`
2. **Understand:** `study/04-read-and-write-paths.md` + `study/05-dynamic-dependencies.md`
3. **Check:** `study/07-invariants-dev-and-prod.md` to see what you can't break
4. **Map:** `study/10-source-map.md` for file locations

### Run These Tests

```bash
# Unit tests for core functionality
pnpm test

# Specific test suites
pnpm test -- runtime.test.ts
pnpm test -- runtime.walkers.test.ts
pnpm test -- runtime.semantic.test.ts

# Regression checks
pnpm test -- runtime.walkers_reggression.dev.test.ts
```

### Watch for These Regressions

- **Bidirectional edge inconsistency** → graph traversal visits wrong nodes
- **Stale dependency persistence** → unrelated branches still invalidate
- **Disposal not terminal** → disposed nodes still execute
- **Cleanup ordering wrong** → new cleanup runs before old cleanup
- **Dynamic dependency not pruned** → previous read still tracked

See `study/07-invariants-dev-and-prod.md` for details.

---

## Extension Points (Safe to Customize)

### Scheduler Integration

**Safe:** Override `onEffectInvalidated` hook to queue watchers differently

```ts
const ctx = createExecutionContext({
  onEffectInvalidated(node) {
    myCustomScheduler.enqueue(node);
  },
});
```

**Careful:** Changing propagation timing can violate "topological consistency" invariant.

### Comparison Functions

**Safe:** Pass custom `compare` to `writeProducer()`

```ts
writeProducer(node, value, (a, b) => deepEqual(a, b), ctx);
```

### Tracking Customization

**Advanced:** Use `untracked()` to disable dependency creation

```ts
const hidden = untracked(() => readProducer(debug), ctx);
```

### Not Safe to Change

❌ Edge structure (bidirectional links)
❌ Dirty state bits in mid-operation
❌ Node disposal without full unlink
❌ Dependency pruning algorithm
❌ Propagation order

See `src/reactivity/walkers/README.md` for algorithm-level details.

---

## Common Questions

**Q: Where do I find the push-invalidation code?**
A: `src/reactivity/walkers/propagate.ts` and `src/reactivity/walkers/propagate.once.ts`

**Q: Where's the pull-stabilization code?**
A: `src/reactivity/walkers/recompute.ts` and `src/reactivity/engine/execute.ts`

**Q: How are dependencies tracked?**
A: `src/reactivity/engine/tracking.ts` + `src/api/read.ts` → `trackRead()` integration

**Q: What's the invariant enforcement level?**
A: Check `NODE_ENV` and `NODE_DEBUG`; see `src/debug_flag.ts`

**Q: How do I understand the state bits?**
A: See `study/03-core-model.md` + `src/reactivity/shape/ReactiveNode.ts`

---

## Related Documentation

- **[../README.md](../README.md)** — Quick start and mental model
- **[../RUNTIME.md](../RUNTIME.md)** — Public API contract
- **[../DISPOSE.md](../DISPOSE.md)** — Disposal and cleanup semantics
- **[../src/reactivity/walkers/README.md](../src/reactivity/walkers/README.md)** — Algorithm deep dives with examples
- **[../DOC-TOPOLOGY.md](../DOC-TOPOLOGY.md)** — Documentation roadmap

---

## Next Steps

1. Start with [01-basics.md](./01-basics.md)
2. Follow the reading order above
3. Cross-check explanations against `src/` files
4. Run tests while reading algorithms
5. Refer to [10-source-map.md](./10-source-map.md) for file navigation
