/* ============================================================
 *  Base types
 * ============================================================ */

export type Task = () => void;
export type Epoch = number;
export type NodeId = number;
export type OwnerId = number;

/** Packed uint32 causal state */
export type CausalState = number;

/* ============================================================
 *  Node kinds (META, not causal)
 * ============================================================ */

export const enum NodeKind {
  OWNER = 1 << 0,
  SIGNAL = 1 << 1,
  COMPUTATION = 1 << 2,
  EFFECT = 1 << 3,
}

/* ============================================================
 *  Lifecycle state (META, not causal)
 * ============================================================ */

export const enum LifeState {
  CREATED = 0,
  ATTACHED = 1,
  ACTIVE = 2,
  DISPOSING = 3,
  DISPOSED = 4,
}

/* ============================================================
 *  Scheduler
 * ============================================================ */

export interface IScheduler {
  schedule(task: Task): void;
}

/**
 * Optional time-aware scheduler.
 * It does NOT own time — it advances the system.
 */
export interface ITemporalScheduler extends IScheduler {
  tick(): void;
}

/* ============================================================
 *  Causal store (NEW CORE)
 * ============================================================ */

export interface CausalSnapshot {
  readonly epoch: number;
  readonly version: number;
  readonly generation: number;
  readonly layout: number;
}

export type NodeStats = {
  sync: number;
  async: number;
  conflicts: number;
  lastJump: number;
};

export interface ICausalStore {
  /** how many nodes are currently allocated */
  readonly size: number;

  /** allocated capacity */
  readonly capacity: number;

  /* ------------ allocation ------------ */

  allocate(): NodeId;
  free(id: NodeId): void;

  /* ------------ access ------------ */

  raw(id: NodeId): CausalState;

  read(id: NodeId): CausalSnapshot;
  write(id: NodeId, epoch: number, version: number, generation: number): void;

  evolve(id: NodeId, stats: NodeStats): void;
}

/* ============================================================
 *  Allocators
 * ============================================================ */

/** Allocator for graph objects */
export interface IAllocator<N> {
  create(): N;
  destroy(node: N): void;
}

/** Allocator specifically for CausalStore */
export interface IStateAllocator {
  allocate(): NodeId;
  free(id: NodeId): void;
}

/* ============================================================
 *  Graph topology (pure structure only)
 * ============================================================ */

export interface IGraph<N> {
  link(source: N, target: N): void;
  unlink(source: N, target: N): void;

  sources(node: N): Iterable<N>;
  targets(node: N): Iterable<N>;
}

/* ============================================================
 *  Ownership model
 * ============================================================ */

export interface IOwned {
  readonly id: NodeId; // linked to ICausalStore
  readonly owner: IOwner | null;
  readonly state: LifeState;

  attach(owner: IOwner): void;
  detach(): void;
  dispose(): void;
}

export interface IOwner extends IOwned {
  readonly id: OwnerId;
  children(): Iterable<IOwned>;

  adopt(node: IOwned): void;
  release(node: IOwned): void;
}

export interface ICascading {
  cascadeDispose(): void;
}

export interface ICascadingOwner extends IOwner, ICascading {}

/* ============================================================
 *  Temporal view (NO OWN TIME, ONLY PROXY)
 * ============================================================ */

export interface ITemporalNode extends IOwned {
  readonly id: NodeId;
}

export interface ITemporalView {
  readonly epoch: Epoch;
  readonly version: number;
  readonly generation: number;
}

/* ============================================================
 *  Runtime (where everything meets)
 * ============================================================ */

export interface IRuntime<N> {
  readonly scheduler: IScheduler;
  readonly allocator: IAllocator<N>;
  readonly topology: IGraph<N>;
  readonly causal: ICausalStore;
}

export interface IRuntimeCallable<N> {
  <T>(fn: (rt: IRuntime<N>) => T): T;
}
