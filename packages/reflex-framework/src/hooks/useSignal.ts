import { signal } from "@volynets/reflex";
import { assertHookUsage } from "./context";
import { useOwned } from "./useOwned";

export function useSignal<T>(initial: T): ReturnType<typeof signal<T>> {
  assertHookUsage("useSignal");
  return useOwned(() => signal(initial));
}
