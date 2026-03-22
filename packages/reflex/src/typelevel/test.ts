/* =========================================================
 * Brands / helpers
 * ======================================================= */

export type Brand<K extends string> = {
  readonly __brand?: K;
};

type AnyFn = (...args: any[]) => any;

/**
 * Direct storable value.
 * If T itself is a function, direct set(T) is disallowed
 * to avoid ambiguity with updater functions.
 */
export type DirectValue<T> = Exclude<T, AnyFn>;

export type Updater<T> = (prev: T) => T;
export type SetInput<T> = DirectValue<T> | Updater<T>;

/* =========================================================
 * Setter model
 * ======================================================= */

export interface RequiredSetter<T> {
  (value: SetInput<T>): T;
}

export interface OptionalSetter<T> {
  (): T;
  (value: SetInput<T>): T;
}

export type Setter<T> = undefined extends T
  ? OptionalSetter<T>
  : RequiredSetter<T>;

/* =========================================================
 * Node kinds
 * ======================================================= */

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

/* =========================================================
 * Internal metadata
 * ======================================================= */

declare const NODE: unique symbol;

interface NodeMeta<T, K extends NodeKind> {
  readonly value: T;
  readonly kind: K;
}

export interface Node<T, K extends NodeKind> {
  readonly [NODE]?: NodeMeta<T, K>;
}

/* =========================================================
 * Core capabilities
 * ======================================================= */

export interface CallableRead<T> {
  (): T;
}

export interface PropertyRead<T> {
  readonly value: T;
}

export interface Writable<T> {
  readonly set: Setter<T>;
}

export interface UntrackedRead<T> {
  readonly peek: () => T;
}

export interface Subscribable {
  subscribe(cb: () => void): () => void;
}

export interface AsyncIterableReadable<T> {
  [Symbol.asyncIterator](): AsyncIterator<T>;
}

export interface Refetchable {
  refetch(): void;
}

export interface ThrowableRead<T> {
  read(): T;
}

export interface Fallible {
  readonly error?: unknown;
}

export type Status = "idle" | "encourage" | "loading" | "ready" | "error";

export interface Stateful<S extends string> {
  readonly status: S;
}

/* =========================================================
 * Base reactive shapes
 * ======================================================= */

export type ReadableCore<T> = CallableRead<T> & PropertyRead<T>;
export type WritableCore<T> = ReadableCore<T> & Writable<T>;
export type PeekableReadableCore<T> = ReadableCore<T> & UntrackedRead<T>;
export type PeekableWritableCore<T> = WritableCore<T> & UntrackedRead<T>;

/* =========================================================
 * Node map
 * ======================================================= */

export interface NodeKindMap {
  signal: PeekableWritableCore<any> & Brand<"signal">;
  computed: PeekableReadableCore<any>;
  memo: PeekableReadableCore<any> & Brand<"memo">;
  derived: PeekableReadableCore<any> & Brand<"derived">;
  realtime: PeekableWritableCore<any> & Subscribable & Brand<"realtime">;
  stream: PeekableWritableCore<any> &
    AsyncIterableReadable<any> &
    Brand<"stream">;
  resource: PeekableWritableCore<any> &
    Stateful<Status> &
    Fallible &
    Refetchable &
    Brand<"resource">;
  suspense: PeekableWritableCore<any> & ThrowableRead<any> & Brand<"suspense">;
  selector: Brand<"selector"> & {
    (key: any): boolean;
  };
  projection: Brand<"projection"> & {
    (key: any): boolean;
  };
}

/* =========================================================
 * Typed node constructor
 * ======================================================= */

export type ReactiveNode<T, K extends keyof NodeKindMap> = Node<T, K> &
  RewriteValue<NodeKindMap[K], T>;

/**
 * Replaces every `any` value-position in a node surface with T
 * for the given public API shape.
 */
type RewriteValue<S, T> = S extends (...args: infer A) => infer R
  ? (...args: A) => ReplaceAny<R, T>
  : S extends object
    ? { [K in keyof S]: RewriteValue<S[K], T> }
    : ReplaceAny<S, T>;

/**
 * “Best effort” any replacement.
 * Keeps non-any types intact.
 */
type ReplaceAny<X, T> = 0 extends 1 & X ? T : X;

/* =========================================================
 * Concrete public node types
 * ======================================================= */

export type Signal<T> = ReactiveNode<T, "signal">;
export type Computed<T> = ReactiveNode<T, "computed">;
export type Memo<T> = ReactiveNode<T, "memo">;
export type Derived<T> = ReactiveNode<T, "derived">;
export type Realtime<T> = ReactiveNode<T, "realtime">;
export type Stream<T> = ReactiveNode<T, "stream">;
export type Resource<T> = ReactiveNode<T, "resource">;
export type Suspense<T> = ReactiveNode<T, "suspense">;
export type Selector<K> = Node<K, "selector"> &
  Brand<"selector"> & {
    (key: K): boolean;
  };
export type Projection<K> = Node<K, "projection"> &
  Brand<"projection"> & {
    (key: K): boolean;
  };

/* =========================================================
 * Unions
 * ======================================================= */

export type AnyReactive =
  | Signal<any>
  | Computed<any>
  | Memo<any>
  | Derived<any>
  | Realtime<any>
  | Stream<any>
  | Resource<any>
  | Suspense<any>
  | Selector<any>
  | Projection<any>;

export type AnyReadable =
  | Signal<any>
  | Computed<any>
  | Memo<any>
  | Derived<any>
  | Realtime<any>
  | Stream<any>
  | Resource<any>
  | Suspense<any>;

export type AnyWritable =
  | Signal<any>
  | Realtime<any>
  | Stream<any>
  | Resource<any>
  | Suspense<any>;

/* =========================================================
 * Tuple APIs
 * ======================================================= */

export type SignalTuple<T> = readonly [get: () => T, set: Setter<T>];

/* =========================================================
 * Type extraction
 * ======================================================= */

export type ValueOf<N> = N extends Node<infer V, any> ? V : never;

export type KindOf<N> = N extends Node<any, infer K> ? K : never;

export type IsKind<N, K extends NodeKind> =
  N extends Node<any, K> ? true : false;

export type WritableValueOf<N> = N extends Writable<infer T> ? T : never;

export type ReadableValueOf<N> =
  N extends CallableRead<infer T>
    ? T
    : N extends PropertyRead<infer T>
      ? T
      : never;

/* =========================================================
 * Family filters
 * ======================================================= */

export type ExtractByKind<N, K extends NodeKind> =
  N extends Node<any, K> ? N : never;

export type ExcludeByKind<N, K extends NodeKind> =
  N extends Node<any, K> ? never : N;

export type WritableKinds =
  | "signal"
  | "realtime"
  | "stream"
  | "resource"
  | "suspense";
export type ReadableKinds =
  | "signal"
  | "computed"
  | "memo"
  | "derived"
  | "realtime"
  | "stream"
  | "resource"
  | "suspense";

export type AsyncKinds = "stream" | "resource" | "suspense";
export type PushKinds = "realtime" | "stream";

/* =========================================================
 * Type guards helpers
 * ======================================================= */

export type HasSetter<N> = N extends { readonly set: Setter<any> }
  ? true
  : false;
export type HasStatus<N> = N extends { readonly status: string } ? true : false;
export type HasError<N> = N extends { readonly error?: unknown } ? true : false;
export type HasReadMethod<N> = N extends { read(): any } ? true : false;
export type HasSubscribe<N> = N extends {
  subscribe(cb: () => void): () => void;
}
  ? true
  : false;

/* =========================================================
 * Utility: lift a node kind to its value type
 * ======================================================= */

export type NodeOf<K extends NodeKind, T> = K extends "signal"
  ? Signal<T>
  : K extends "computed"
    ? Computed<T>
    : K extends "memo"
      ? Memo<T>
      : K extends "derived"
        ? Derived<T>
        : K extends "realtime"
          ? Realtime<T>
          : K extends "stream"
            ? Stream<T>
            : K extends "resource"
              ? Resource<T>
              : K extends "suspense"
                ? Suspense<T>
                : K extends "selector"
                  ? Selector<T>
                  : K extends "projection"
                    ? Projection<T>
                    : never;
