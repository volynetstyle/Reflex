export interface EventSubscriber<T> {
  fn: (value: T) => void;
  next: EventSubscriber<T> | null;
  prev: EventSubscriber<T> | null;
  state: number;

  unlinkNext: EventSubscriber<T> | null;
}

export class EventSource<T> {
  dispatchDepth = 0;

  head: EventSubscriber<T> | null = null;
  tail: EventSubscriber<T> | null = null;

  pendingHead: EventSubscriber<T> | null = null;
}


export type EventBoundary = <T>(fn: () => T) => T;

type ComputeFn<T> = ((previous?: T) => T) | (() => T) | null;

export interface ReactiveEdge {
  from: ReactiveNode;
  to: ReactiveNode;
  prevOut: ReactiveEdge | null;
  nextOut: ReactiveEdge | null;
  prevIn: ReactiveEdge | null;
  nextIn: ReactiveEdge | null;
}

export interface ReactiveNode<T = unknown> {
  state: number;
  compute: ComputeFn<T>;
  firstOut: ReactiveEdge | null;
  firstIn: ReactiveEdge | null;
  lastOut: ReactiveEdge | null;
  lastIn: ReactiveEdge | null;
  depsTail: ReactiveEdge | null;
  payload: T;
}

export interface EngineHooks {
  onEffectInvalidated?(node: ReactiveNode): void;
}

export interface EngineContext {
  activeComputed: ReactiveNode | null;
  readonly hooks: EngineHooks;
  dispatchWatcherEvent(node: ReactiveNode): void;
  resetState(): void;
  setHooks(hooks?: EngineHooks): void;
}
