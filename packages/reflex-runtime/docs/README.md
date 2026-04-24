# @reflex/runtime — Documentation Index

Welcome to the `@reflex/runtime` documentation. This package is a **low-level reactive graph engine** for deterministic, host-controlled execution.

Start here to find what you need.

---

## For Different Audiences

### 👤 I'm a New User

Start with the quick introduction:

1. **[README.md](./README.md)** (10 min)
   - Mental model: producer, consumer, watcher
   - Minimal example with 3 lines of code
   - When to use this library

2. **[RUNTIME.md](./RUNTIME.md)** — Public Contract (20 min)
   - What the package exports
   - Exact semantics of each operation
   - Observable guarantees

3. **Pick a use case** and refer to study guides if needed

---

### 🏗️ I'm Building a Framework on Top

Read these to understand integration points:

1. **[README.md](./README.md)** — Quick mental model
2. **[RUNTIME.md](./RUNTIME.md)** — Full API contract
3. **[DISPOSE.md](./DISPOSE.md)** — Cleanup semantics (critical!)
4. **[study/06-effects-and-scheduler.md](./study/06-effects-and-scheduler.md)** — Hook integration (30 min)

Key files:
- Execution hooks: `EngineHooks`
- Watcher management: `runWatcher()`, `disposeWatcher()`
- Dirty state tracking: `readConsumer()` modes and semantics

---

### 🔧 I'm Maintaining or Modifying the Runtime

Follow this structured approach:

1. **[MAINTENANCE.md](./MAINTENANCE.md)** — Where to start (15 min)
   - Quick reference for common tasks
   - How to safely make changes
   - Testing discipline
   - Performance zones

2. **[INVARIANTS.md](./INVARIANTS.md)** — Engineering Contract (30 min)
   - 10 core invariants that must always hold
   - Where each is enforced in code
   - What breaks if violated
   - Related tests

3. **Deep dive** using [study/README.md](./study/README.md)
   - Reading order: 01 → 10
   - Understand each subsystem
   - Cross-reference code

4. **Algorithm details** from [src/reactivity/walkers/README.md](./src/reactivity/walkers/README.md)
   - Push invalidation phase
   - Pull stabilization phase
   - Re-entrancy and fanout

---

### 🐛 I'm Debugging a Bug

1. **Identify the symptom:**
   - Stale values appearing? → Check [INVARIANTS.md #2](./INVARIANTS.md#2-changed-vs-invalid-semantics)
   - Ghost invalidations? → Check [INVARIANTS.md #3](./INVARIANTS.md#3-stale-dependency-pruning)
   - Effects firing wrong? → Check [study/06-effects-and-scheduler.md](./study/06-effects-and-scheduler.md)
   - Memory leaks? → Check [INVARIANTS.md #1](./INVARIANTS.md#1-bidirectional-edge-consistency)

2. **Enable debug mode:**
   ```bash
   NODE_DEBUG=@reflex/* pnpm test
   ```

3. **Run specific tests:**
   ```bash
   pnpm test -- runtime.semantic.test.ts --grep "your-symptom"
   ```

4. **Consult:**
   - [MAINTENANCE.md — Common Pitfalls](./MAINTENANCE.md#common-pitfalls)
   - [INVARIANTS.md](./INVARIANTS.md) — Check what's broken

---

## Documentation Overview

| Document | Purpose | Audience | Time |
|----------|---------|----------|------|
| **[README.md](./README.md)** | Quick intro, mental model | Everyone | 10 min |
| **[RUNTIME.md](./RUNTIME.md)** | Authoritative API contract | Integrators, maintainers | 20 min |
| **[DISPOSE.md](./DISPOSE.md)** | Disposal semantics and lifecycle | Framework builders | 15 min |
| **[DOC-TOPOLOGY.md](./DOC-TOPOLOGY.md)** | Doc structure and navigation | Documentarians | 10 min |
| **[INVARIANTS.md](./INVARIANTS.md)** | Engineering contract (10 invariants) | Maintainers | 30 min |
| **[MAINTENANCE.md](./MAINTENANCE.md)** | How to safely modify runtime | Contributors | 20 min |
| **[study/README.md](./study/README.md)** | Study guide map | Maintainers | 10 min |
| **[study/0X-*.md](./study/)** | Deep dives (11 modules) | Deep learners | 150–250 min total |
| **[src/reactivity/walkers/README.md](./src/reactivity/walkers/README.md)** | Algorithm reference | Algorithm maintainers | 30 min |

---

## Quick Command Reference

### Running Tests

```bash
# All tests
pnpm test

# Specific test suites
pnpm test -- runtime.walkers.test.ts    # Core algorithms
pnpm test -- runtime.semantic.test.ts   # Correctness
pnpm test -- runtime.lifecycle.test.ts  # Disposal

# With verbose output
pnpm test -- --reporter=verbose

# Match specific test
pnpm test -- --grep "stale-suffix"
```

### Benchmarking

```bash
# Build and run perf suite
pnpm build:perf
pnpm bench:core

# Compare against baseline
# (Keep output from first run, run again after changes)
```

### Debug Mode

```bash
# Enable debug logging
NODE_DEBUG=@reflex/* pnpm test

# Use introspection API
import { subtle } from "@reflex/runtime/debug";
subtle.label(node, "name");
subtle.snapshot(node);
```

---

## Terminology

The runtime uses precise terminology consistently:

| Term | Definition |
|------|-----------|
| **Producer** | Mutable source state; stores payload directly |
| **Consumer** | Pure derived computation; tracks dependencies, caches result |
| **Watcher** | Sink node; executes host-controlled side effects |
| **Dirty/Invalid** | Node needs recomputation (bit flags: `Invalid`, `Changed`) |
| **Changed** | Direct upstream definitely changed → recompute always |
| **Invalid** | Transitive change possible → verify before recomputing |
| **Disposed** | Terminal state; no further graph participation |
| **Edge** | Directed dependency link (bidirectional structure) |
| **Propagation** | Push phase: cheap invalidation pass |
| **Stabilization** | Pull phase: lazy verification and recomputation |
| **Host** | Consumer of the runtime; responsible for scheduling |
| **Execution Context** | Runtime environment: owns hooks, tracking state |
| **onSinkInvalidated** | Hook: signals when a sink node becomes dirty |
| **onReactiveSettled** | Hook: signals when graph reaches quiescence |

---

## File Structure

```
@reflex/runtime/
├── README.md                         ← Start here
├── RUNTIME.md                        ← Public contract
├── DISPOSE.md                        ← Disposal protocol
├── INVARIANTS.md                     ← Engineering contract (10 invariants)
├── MAINTENANCE.md                    ← For contributors
├── DOC-TOPOLOGY.md                   ← Doc structure
├── this file: INDEX.md               ← Doc roadmap
│
├── src/
│   ├── api/                          ← Public API: read, write, watcher
│   ├── reactivity/
│   │   ├── context.ts                ← Execution context
│   │   ├── engine/                   ← Compute, tracking, execution
│   │   ├── shape/                    ← Node, Edge data structures
│   │   └── walkers/                  ← Push/pull algorithms
│   │       └── README.md             ← Algorithm reference
│   └── debug*.ts                     ← Debug introspection
│
├── study/
│   ├── README.md                     ← Study guide map
│   ├── 01-basics.md                  ← Producer/consumer/watcher
│   ├── 02-public-api.md              ← What the package exports
│   ├── 03-core-model.md              ← ReactiveNode, state bits
│   ├── 04-read-and-write-paths.md    ← Control flow deep dive
│   ├── 05-dynamic-dependencies.md    ← Tracking and branch switching
│   ├── 06-effects-and-scheduler.md   ← Watcher protocol
│   ├── 07-execution-contexts.md      ← Context lifecycle
│   ├── 07-invariants-dev-and-prod.md ← Critical invariants
│   ├── 08-performance.md             ← Cost model and optimization
│   ├── 09-extension-guide.md         ← Safe seams
│   └── 10-source-map.md              ← File organization
│
├── tests/
│   ├── runtime.walkers.test.ts       ← Core algorithm tests
│   ├── runtime.semantic.test.ts      ← Correctness tests
│   ├── runtime.lifecycle.test.ts     ← Disposal tests
│   └── ...
│
└── package.json                      ← Exports, scripts
```

---

## Common Workflows

### Workflow 1: Understand How Things Work

```
README.md (10 min)
    ↓
RUNTIME.md (20 min)
    ↓
study/01-basics.md through 05 (60 min)
    ↓
Read corresponding src/ files (120 min)
    ↓
Run tests while reading: pnpm test
```

### Workflow 2: Make a Safe Change

```
MAINTENANCE.md (15 min)
    ↓
INVARIANTS.md (30 min)
    ↓
Create test case (10 min)
    ↓
Make change (30 min)
    ↓
pnpm test (5 min)
    ↓
pnpm bench:core if hot path (10 min)
    ↓
Update docs if needed (15 min)
```

### Workflow 3: Debug a Bug

```
Run tests with verbose output (5 min)
    ↓
Identify symptom (10 min)
    ↓
Check INVARIANTS.md for related invariant (5 min)
    ↓
Read MAINTENANCE.md — Common Pitfalls (10 min)
    ↓
Write failing test case (20 min)
    ↓
Locate and fix (variable time)
    ↓
Verify: pnpm test (5 min)
```

---

## Related Packages

- **[@reflex/core](../core/)** — Builds on runtime, adds convenience APIs
- **[reflex](../reflex/)** — Framework integrations and higher-level abstractions
- **[reflex-dom](../reflex-dom/)** — DOM bindings
- **[reflex-framework](../reflex-framework/)** — Application framework

---

## Contributing

See [MAINTENANCE.md](./MAINTENANCE.md) for:
- Testing discipline
- Code review guidelines
- Performance expectations
- Invariant checks

---

## License

MIT — See [LICENSE](./LICENSE) in package root
