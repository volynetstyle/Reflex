import { signal } from "@volynets/reflex";
import { assertHookUsage } from "./context";
import { useHookSlot } from "./slot";

export function useSignal<T>(initial: T): ReturnType<typeof signal<T>> {
  assertHookUsage("useSignal");
  return useHookSlot(() => signal(initial)).value;
}
