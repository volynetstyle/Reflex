import { createDerivedProjection } from "./selectors/store";
import { isPlain } from "./values";
import type { StoreDisposable } from "./types";

/**
 * Creates a lazy, read-only structured projection from a pure-return callback.
 * Return a plain object; use reactiveMap for state with dynamic keys.
 */
export function derive<T extends object>(
  compute: () => T,
  options: { name?: string } = {},
): Readonly<T> & StoreDisposable {
  return createDerivedProjection<T>(() => {
    const value = compute();
    if (!isPlain(value) || Array.isArray(value))
      throw new TypeError("derive() must return a plain object");
    return value;
  }, options);
}
