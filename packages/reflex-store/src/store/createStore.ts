import type { StoreBoundary } from "./boundaries";

/* eslint-disable @typescript-eslint/no-explicit-any -- callable store methods preserve their specific parameter tuples. */
type StoreLeaf =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined
  | readonly unknown[]
  | ((...args: any[]) => unknown)
  | StoreBoundary<unknown>;

export declare const compiledShape: unique symbol;
type Same<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
export type StoreData<T> = {
  [K in keyof T as T[K] extends (...args: any[]) => unknown
    ? never
    : Same<Pick<T, K>, { -readonly [P in K]: T[P] }> extends true
      ? K
      : never]: T[K] extends StoreBoundary<infer V>
    ? V
    : T[K] extends StoreShape
      ? StoreData<T[K]>
      : T[K];
};

export interface StoreOptions {
  name?: string;
}

export type StoreShape = {
  [key: string]: StoreLeaf | StoreShape;
};

type CompiledValue<T> =
  T extends StoreBoundary<infer TLeaf>
    ? TLeaf
    : T extends StoreShape
      ? CompiledBranch<T>
      : T;

type CompiledBranch<TShape extends StoreShape> = {
  -readonly [K in keyof TShape]: CompiledValue<TShape[K]>;
};

export type CompiledStore<TShape extends StoreShape> =
  CompiledBranch<TShape> & {
    readonly [compiledShape]: TShape;
    dispose(): void;
    [Symbol.dispose](): void;
  };

/**
 * Declares a compile-time store shape for the compiled-store transform.
 *
 * Data properties become leaf cells; methods become batched actions; getters
 * become lazy computed values. leaf() and opaque() mark object values as
 * replaceable leaves. If this function executes at runtime, the transform did
 * not run.
 */
export function createStore<TShape extends StoreShape>(
  _shape: TShape,
  _options?: StoreOptions,
): CompiledStore<TShape> {
  throw new Error(
    "createStore() is a compile-time API and must be erased by a transform before runtime.",
  );
}
