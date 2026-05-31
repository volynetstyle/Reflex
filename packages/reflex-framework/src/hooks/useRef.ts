import { assertHookUsage } from "./context";
import { useHookSlot } from "./slot";

export interface RefObject<T> {
  current: T;
}

export function useRef<T>(initial: T): RefObject<T> {
  assertHookUsage("useRef");

  return useHookSlot<RefObject<T>>(() => ({ current: initial })).value;
}
