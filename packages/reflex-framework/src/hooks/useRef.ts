import { assertHookUsage } from "./context";

export interface RefObject<T> {
  current: T;
}

export function useRef<T>(initial: T): RefObject<T> {
  assertHookUsage("useRef");

  // `initial` is used only during hook creation.
  // Later values are intentionally ignored for this ownership node lifetime.
  return { current: initial };
}
