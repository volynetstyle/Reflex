# Documentation Topology

This document defines the role of each documentation file and the canonical reading path for `@reflex/runtime`.

## Document Roles

### 1. **README.md** — Entry Point for External Readers
- **Audience:** New users, package discoverers, integration engineers
- **Purpose:** Quick orientation on what Reflex runtime is and why it exists
- **Content:**
  - Mental model (producer/consumer/watcher)
  - 1 minimal working example
  - Core philosophy: explicit complexity, host-driven scheduling
  - Clear separation: what runtime provides vs. host responsibilities
  - Link to deeper docs

**Status:** Current ✓  
**Scope:** ~200-300 lines, high-level only

---

### 2. **RUNTIME.md** — Public Contract Specification
- **Audience:** Integrators, maintainers, anyone relying on runtime semantics
- **Purpose:** Authoritative statement of what is stable and observable
- **Content:**
  - Public exports (API surface)
  - Node kinds and their exact behavior (Producer, Consumer, Watcher)
  - Execution context model and hooks
  - Observable invariants (e.g., dirty-state model, disposal terminal state)
  - State constants and their meanings
  - ExecutionContext semantics
  - Debug surface

**Status:** Current ✓  
**Scope:** ~500-700 lines, precise and exhaustive

---

### 3. **DISPOSE.md** — Lifecycle & Disposal Contract
- **Audience:** Maintainers extending runtime, hosts managing lifetimes
- **Purpose:** Single source of truth for node disposal and cleanup semantics
- **Content:**
  - Core disposal rules (dead is terminal, no reactivation)
  - Graph entry point behavior with disposed nodes
  - Cleanup ordering guarantees
  - Watcher cleanup and reachability
  - Integration with dynamic dependencies

**Status:** Current ✓  
**Scope:** ~150-200 lines, specific to lifecycle

---

### 4. **study/README.md** — Maintainers' Reading Map
- **Audience:** Runtime maintainers, contributors, people modifying src/
- **Purpose:** Structured learning path for deep understanding
- **Content:**
  - Curated order of study materials
  - Status annotations (current, historical, needs-refresh)
  - Brief description of what each module teaches
  - Prerequisites and dependencies between topics
  - Reference to applicable code files

**Status:** Needs refresh  
**Scope:** ~100 lines, navigation only

---

### 5. **study/0X-*.md** — Deep Dives for Maintainers
- **Audience:** Maintainers, performance optimizers, algorithm designers
- **Purpose:** Detailed explanations of subsystems, algorithms, design decisions
- **Content per file:**
  - 01-basics.md: Push invalidation, pull stabilization, lazy evaluation
  - 02-public-api.md: What the package exports and why
  - 03-core-model.md: ReactiveNode, ReactiveEdge, state bits, depsTail
  - 04-read-and-write-paths.md: writeProducer flow, readConsumer flow, recomputation
  - 05-dynamic-dependencies.md: trackRead, branch switching, stale-suffix cleanup
  - 06-effects-and-scheduler.md: Watcher protocol, host hooks, no built-in scheduler
  - 07-execution-contexts.md: Context management, hooks, lifecycle
  - 07-invariants-dev-and-prod.md: Critical invariants and their enforcement
  - 08-performance.md: Cost model, hot paths, optimization targets
  - 09-extension-guide.md: Safe extension points, seams for customization
  - 10-source-map.md: File organization, dependency graph of modules, reading order

**Status:** Partially needs refresh  
**Scope:** 150-250 lines each

---

### 6. **src/reactivity/walkers/README.md** — Core Algorithm Reference
- **Audience:** Runtime implementers, algorithm maintainers
- **Purpose:** Detailed specification of push and pull phases
- **Content:**
  - Push phase: propagate() algorithm and invalidation rules
  - Pull phase: shouldRecompute() and recompute() logic
  - Fanout handling and re-entrancy guarantees
  - Edge traversal and state mutations
  - Connection to specific implementation files

**Status:** Current but needs reorganization  
**Scope:** ~200-300 lines (currently ~974 lines due to verbose examples)

---

## Canonical Reading Path

### For External Users
1. **README.md** → understand the mission
2. **RUNTIME.md** → see public API and guarantees
3. Pick a study guide based on your needs

### For Integrators / Host Developers
1. **README.md** → context
2. **RUNTIME.md** → detailed public contract
3. **DISPOSE.md** → cleanup and lifecycle semantics
4. **study/06-effects-and-scheduler.md** → hook model and scheduler integration

### For Runtime Maintainers
1. **study/README.md** → orient yourself
2. Follow the suggested study order (01 → 10)
3. Reference **src/reactivity/walkers/README.md** for algorithm questions
4. Consult **RUNTIME.md** and **DISPOSE.md** for invariant checks

### For Bug Triage / Regression Hunting
1. **study/07-invariants-dev-and-prod.md** → check invariant violations
2. **study/04-read-and-write-paths.md** → understand control flow
3. **src/reactivity/walkers/README.md** → debug specific algorithm issues

---

## Document Status Annotations

### Current ✓
Documents that accurately reflect the current codebase and are maintained.

### Historical ⚠️
Documents that describe previous versions or deprecated designs.
These should be clearly marked with a header warning.

### Needs Refresh 🔄
Documents that are mostly correct but need verification against current code
or minor updates to reflect recent changes.

---

## Terminology Consistency

All documentation uses these terms consistently:

- **Producer** — mutable source, holds payload, no compute
- **Consumer** — pure derived value, computes lazily, caches result
- **Watcher** — effect-like sink, no output value, host-scheduled execution
- **Dirty state** — node needs recomputation (DIRTY_STATE bits)
- **Invalid/Changed** — propagation tokens indicating invalidation scope
- **ExecutionContext** — execution environment, owns hooks and tracking state
- **Push phase** — cheap invalidation via propagate()
- **Pull phase** — stabilization via readConsumer()
- **Host** — consumer of the runtime, responsible for scheduling and effects

---

## Cross-References

| Topic | Primary Docs | Supporting |
|-------|--------------|-----------|
| API Surface | RUNTIME.md | README.md, study/02 |
| Node Model | RUNTIME.md, study/03 | study/01, study/04 |
| Disposal | DISPOSE.md, RUNTIME.md | study/05 (dynamic deps) |
| Watchers/Effects | study/06, RUNTIME.md | DISPOSE.md |
| Execution Context | RUNTIME.md, study/07 | study/06 |
| Invariants | study/07, src/walkers/README | RUNTIME.md, tests/ |
| Algorithms | src/walkers/README | study/04, study/05 |
| Performance | study/08 | study/04 (hot paths) |
| Extension | study/09 | RUNTIME.md (contract) |

---

## Next Steps

See individual document headers for their specific status and refresh requirements.
