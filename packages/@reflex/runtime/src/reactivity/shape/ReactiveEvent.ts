export interface ReactiveEvent<T> {
  fn: (value: T) => void;
  next: ReactiveEvent<T> | null;
  prev: ReactiveEvent<T> | null;
  active: boolean;
}

export interface EventSourceNode<T> {
  head: ReactiveEvent<T> | null;
  tail: ReactiveEvent<T> | null;
}

export type Boundary = <T>(fn: () => T) => T;