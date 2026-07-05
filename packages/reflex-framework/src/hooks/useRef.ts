import { assertHookUsage } from "./context";
import { useOwned } from "./useOwned";

export interface RefObject<T> {
  current: T;
}

export function useRef<T>(initial: T): RefObject<T> {
  assertHookUsage("useRef");

  return useOwned<RefObject<T>>(() => ({ current: initial }));
}
