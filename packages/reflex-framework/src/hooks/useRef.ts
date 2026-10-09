import { assertHookUsage } from "./context";

/** Mutable holder whose updates do not trigger reactive computations. */
export interface RefObject<T> {
  current: T;
}

/**
 * Creates a ref object for the current component owner.
 * Updating `current` does not trigger a reactive update.
 *
 * @remarks
 * **When to use:** to store a DOM reference or other value outside the
 * dependency graph.
 * **When not to use:** for data whose changes should update the DOM; use
 * `useSignal`.
 *
 * @param initial The initial value of `current`.
 * @typeParam T The stored value type.
 */
export function useRef<T>(initial: T): RefObject<T> {
  assertHookUsage("useRef");

  // `initial` is used only during hook creation.
  // Later values are intentionally ignored for this ownership node lifetime.
  return { current: initial };
}
