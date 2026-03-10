export type Brand<K extends string> = {
  readonly __brand?: K;
};

type AnyFn = (...args: any[]) => any;
type NonFn<T> = Exclude<T, AnyFn>;

export type Updater<T> = (prev: T) => T;
export type SetInput<T> = NonFn<T> | Updater<T>;

export type Setter<T> = undefined extends T
  ? (value?: SetInput<T>) => T
  : (value: SetInput<T>) => T;

export interface SignalCore<T> {
  (): T;
  value: T;
  set: Setter<T>;
}

export type SignalTuple<T> = readonly [get: () => T, set: Setter<T>];

export type NodeKind =
  | "signal"
  | "computed"
  | "memo"
  | "derived"
  | "realtime"
  | "stream"
  | "resource"
  | "suspense"
  | "selector"
  | "projection";

declare const NODE: unique symbol;

interface __NodeMeta<T, K extends NodeKind> {
  readonly [NODE]?: {
    value: T;
    kind: K;
  };
}

export interface Node<T, K extends NodeKind> extends __NodeMeta<T, K> {}

export type Signal<T> = SignalCore<T> & Node<T, "signal"> & Brand<"signal">;

export type Computed<T> = (() => T) & Node<T, "computed">;

export type Realtime<T> = SignalCore<T> &
  Node<T, "realtime"> &
  Brand<"realtime"> & {
    subscribe(cb: () => void): () => void;
  };

export type Stream<T> = SignalCore<T> &
  Node<T, "stream"> &
  Brand<"stream"> & {
    [Symbol.asyncIterator](): AsyncIterator<T>;
  };

export type Status = "idle" | "encourage" | "loading" | "ready" | "error";

export type Resource<T> = SignalCore<T> &
  Node<T, "resource"> &
  Brand<"resource"> & {
    status: Status;
    error?: unknown;
    refetch(): void;
  };

export type Suspense<T> = SignalCore<T> &
  Node<T, "suspense"> &
  Brand<"suspense"> & {
    read(): T; // может бросать promise/error
  };

export interface Selector<K> extends Node<K, "selector">, Brand<"selector"> {
  (key: K): boolean;
}

export interface Projection<K>
  extends Node<K, "projection">,
    Brand<"projection"> {
  (key: K): boolean;
}

export type Readable<T = any> = SignalCore<T> & Node<T, NodeKind>;

export type AnyNode = Node<any, any>;

export type ValueOf<N> = N extends Node<infer V, any> ? V : never;

export type KindOf<N> = N extends Node<any, infer K> ? K : never;
