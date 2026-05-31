export type {
  KeyedOptions,
  ProjectionOptions,
  StoreProjectionOptions,
} from "./shared";
export { createKeyedProjection, createSelector } from "./keyed";
export { createStoreProjection } from "./store";

import { createKeyedProjection } from "./keyed";
import { createStoreProjection } from "./store";
import type {
  ProjectionOptions,
  StoreProjectionOptions,
} from "./shared";
import type { Accessor } from "../types";

export function createProjection<T extends object>(
  fn: (draft: T) => void | T,
  seed: Partial<T>,
  options?: StoreProjectionOptions<T>,
): T;
export function createProjection<T, K, R>(
  source: Accessor<T>,
  keyOf: (value: T) => K,
  project: (value: T) => R,
  options?: ProjectionOptions<K, R>,
): (key: K) => R | undefined;
export function createProjection<T, K, R>(
  sourceOrProject: Accessor<T> | ((draft: T & object) => void | (T & object)),
  keyOrSeed: ((value: T) => K) | Partial<T & object>,
  projectOrOptions?: ((value: T) => R) | StoreProjectionOptions<T & object>,
  options?: ProjectionOptions<K, R>,
): T | ((key: K) => R | undefined) {
  if (
    typeof keyOrSeed === "function" &&
    typeof projectOrOptions === "function"
  ) {
    return createKeyedProjection(
      sourceOrProject as Accessor<T>,
      keyOrSeed,
      projectOrOptions,
      options ?? {},
    );
  }

  return createStoreProjection(
    sourceOrProject as (draft: T & object) => void | (T & object),
    keyOrSeed as Partial<T & object>,
    (projectOrOptions ?? {}) as StoreProjectionOptions<T & object>,
  );
}
