# Reflex Contracts

This document describes the **contracts and invariants** defined in `@reflex/contract`.  
They specify _what must hold_ in a Reflex runtime, independently of any particular implementation.

## 1. Time & Scheduling

### Types

- `Task = () => void` — a unit of work scheduled by the runtime
- `Epoch = number` — logical time, local to the runtime

### Interfaces

- `IScheduler`
  - `schedule(task: Task): void`
  - Must enqueue the task for execution (immediately or later)
  - Must be non-blocking for valid tasks

- `ITemporalScheduler extends IScheduler`
  - `readonly epoch: Epoch`
  - `nextEpoch(): void`
  - Invariant: `epoch` is monotonically increasing

## 2. Allocation

- `IAllocator<T>`
  - `create(): T` — returns a fresh instance
  - `destroy(node: T): void` — node is considered invalid after this call

No pooling or GC policy is defined at this level.

## 3. Graph / Causality

- `IGraph<N>`
  - `link(source: N, target: N): void`
  - `unlink(source: N, target: N): void`
  - `sources(node: N): Iterable<N>`
  - `targets(node: N): Iterable<N>`

Interpretation:

- `source → target` means “target depends on source”
- `sources(node)` are upstream dependencies
- `targets(node)` are downstream dependents

Invariants:

- `link()` must be idempotent for the same pair
- `sources(node)` and `targets(node)` must not include `node` itself

## 4. Runtime Container

- `IRuntime<N>`
  - `readonly scheduler: IScheduler | ITemporalScheduler`
  - `readonly allocator: IAllocator<N>`
  - `readonly graph: IGraph<N>`

- `IRuntimeCallable<N>`
  - `<T>(action: (runtime: IRuntime<N>) => T): T`

This layer defines **what a minimal execution environment provides**:
scheduling, allocation, and causality graph.

## 5. Ownership & Lifetime

### Types

- `OwnerId = number`
- `LifeState`
  - `CREATED → ATTACHED | ACTIVE`
  - `ATTACHED → ACTIVE | DISPOSING`
  - `ACTIVE → DISPOSING`
  - `DISPOSING → DISPOSED`
  - `DISPOSED` is terminal

### Lifetime

- `ILifetime`
  - `createdAt: Epoch`
  - `updatedAt: Epoch`
  - `disposedAt: Epoch | null`

Invariants:

- `createdAt <= updatedAt`
- If `disposedAt != null` then `disposedAt >= updatedAt`
- After final disposal, `updatedAt === disposedAt`

### Owned / Owner

- `IOwned`
  - `readonly owner: IOwner | null`
  - `readonly state: LifeState`
  - `attach(owner: IOwner): void`
  - `detach(): void`
  - `dispose(): void` (idempotent)

Invariants:

- A node has at most one owner at a time
- If `owner !== null`, then `owner.children` must contain this node
- `dispose()` must eventually drive `state` to `DISPOSED`

- `IOwner extends IOwned`
  - `readonly id: OwnerId`
  - `readonly children: ReadonlySet<IOwned>`
  - `adopt(node: IOwned): void`
  - `release(node: IOwned): void`

Ownership invariants:

- Ownership forms a tree (no cycles)
- After `adopt(node)`:
  - `node.owner === this`
  - `children` contains `node`
- After `release(node)` when `node.owner === this`:
  - `node.owner === null`
  - `children` no longer contains `node`

### Cascading Disposal

- `ICascading`
  - `cascadeDispose(): void`

- `ICascadingOwner extends IOwner, ICascading`

Invariants:

- After `cascadeDispose()`:
  - `children` should be empty
  - all previously owned nodes must be in `DISPOSING` or `DISPOSED` state
- Calling `dispose()` on an `ICascadingOwner` must eventually cascade to all descendants

### Temporal Nodes

- `ITemporalNode extends IOwned, ILifetime`

Invariants:

- All lifetime and ownership invariants must hold simultaneously

---

With this contract layer in place:

- `@reflex/core` implements **how** these contracts are realized (intrusive lists, pools, DAG, etc.).
- `@reflex/runtime` chooses policies (schedulers, epochs, modes).
- Your public `reflex` package re-exports only the safe, high-level API.
