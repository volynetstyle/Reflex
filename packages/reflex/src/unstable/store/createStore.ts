type StoreLeaf = string | number | boolean | bigint | symbol | null | undefined;

export type StoreShape = {
  [key: string]: StoreLeaf | StoreShape;
};

export type CompiledStore<TShape extends StoreShape> = {
  -readonly [K in keyof TShape]: TShape[K] extends StoreShape
    ? CompiledStore<TShape[K]>
    : TShape[K];
};

/**
 * Declares a compile-time store shape for the experimental compiled-store
 * transform.
 *
 * The current experiment is intentionally compile-only:
 * - production code is expected to erase this call through a transform
 * - dynamic keys, spread, reflection, and aliasing are out of scope
 * - only static dot-path reads and writes are part of the semantic core
 *
 * If this function executes at runtime, the transform did not run.
 */
export function createStore<TShape extends StoreShape>(
  _shape: TShape,
): CompiledStore<TShape> {
  throw new Error(
    "createStore() is a compile-time experimental API and must be erased by a transform before runtime.",
  );
}
