/* ---------------------------------------------
 * Branding
 * --------------------------------------------- */

declare const BRAND: unique symbol;
export type Brand<K extends string> = { readonly [BRAND]: K };

/* ---------------------------------------------
 * Utils
 * --------------------------------------------- */

type AnyFn = (...args: any[]) => any;
type NonFn<T> = Exclude<T, AnyFn>;

type IsOptional<T> = undefined extends T ? true : false;

/* ---------------------------------------------
 * Core primitives
 * --------------------------------------------- */

/** Value getter */
export type Accessor<T> = () => T;

/** updater(prev) form */
export type Updater<T> = (prev: T) => T;

/** setter accepts value OR updater */
export type SetInput<T> = NonFn<T> | Updater<T>;

/**
 * Minimal Setter<T>
 * - Optional signal: set() allowed
 * - Non-optional: set(input) required
 */
export type Setter<T> =
  IsOptional<T> extends true
    ? {
        (): undefined;
        <U extends T>(input: SetInput<U>): U;
      }
    : <U extends T>(input: SetInput<U>) => U;

/** signal tuple */
export type SignalTuple<T> = readonly [get: Accessor<T>, set: Setter<T>];

/** accessor with extended api */
export type AccessorEx<T> = Accessor<T> & {
  readonly value: T;
  set: Setter<T>;
};

/* ---------------------------------------------
 * Branded variants
 * --------------------------------------------- */

export type BrandedAccessor<K extends string, T> = AccessorEx<T> & Brand<K>;
export type BrandedSignal<K extends string, T> = SignalTuple<T> & Brand<K>;

/* ---------------------------------------------
 * Extensions / Mixins
 * --------------------------------------------- */

export type Status = "idle" | "encourage" | "loading" | "ready" | "error";

export type WithRealtime = {
  /** emits every time value changes (sync) */
  subscribe(cb: () => void): () => void;
};

export type WithStream<T = unknown> = {
  /** async iteration interface */
  [Symbol.asyncIterator](): AsyncIterator<T>;
};

export type WithResource = {
  status: Status;
  error?: unknown;
  refetch(): void;
};

export type WithSuspense = {
  /** throws promise/error on read to integrate with suspense */
  suspense: true;
};

export interface Selector<K> {
  (key: K): boolean;
}

export type Signal<T>    = BrandedSignal<"signals", T>;
export type Realtime<T>  = BrandedSignal<"realtimes", T> & WithRealtime;
export type Stream<T>    = BrandedSignal<"streams", T> & WithStream<T>;
export type Resource<T>  = BrandedSignal<"resource", T> & WithResource;
export type Suspense<T>  = BrandedSignal<"suspense", T> & WithSuspense;
export type Readable<T = any> =
  | Signal<T>
  | Realtime<T>
  | Stream<T>
  | Resource<T>
  | Suspense<T>;
