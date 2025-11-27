export type Task = () => void;
export type Epoch = number;
export type OwnerId = number;

export const enum NodeKind {
  OWNER = 1 << 0,
  SIGNAL = 1 << 1,
  COMPUTATION = 1 << 2,
  EFFECT = 1 << 3,
}

export const enum LifeState {
  CREATED = 0,
  ATTACHED = 1,
  ACTIVE = 2,
  DISPOSING = 3,
  DISPOSED = 4,
}

export interface IScheduler {
  schedule(task: Task): void;
}

export interface ITemporalScheduler extends IScheduler {
  readonly epoch: Epoch;
  nextEpoch(): void;
}

export interface IAllocator<N extends INode> {
  create(): N;
  destroy(node: N): void;
}

export interface IGraph<N extends INode> {
  link(source: N, target: N): void;
  unlink(source: N, target: N): void;

  sources(node: N): Iterable<N>;
  targets(node: N): Iterable<N>;
}

export interface IRuntime<N extends INode> {
  readonly scheduler: IScheduler | ITemporalScheduler;
  readonly allocator: IAllocator<N>;
  readonly topology: IGraph<N>;
}

export interface IRuntimeCallable<N extends INode> {
  <T>(fn: (rt: IRuntime<N>) => T): T;
}

export interface INode {
  readonly id: number;
  readonly kind: NodeKind;
}

export interface IOwned extends INode {
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

export interface ITemporalNode extends IOwned {
  readonly createdAt: Epoch;
  readonly updatedAt: Epoch;
  readonly disposedAt: Epoch | null;
}
