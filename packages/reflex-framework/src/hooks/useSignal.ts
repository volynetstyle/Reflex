import { signal } from "@volynets/reflex";
import { assertHookUsage } from "./context";

export function useSignal<T>(initial: T): ReturnType<typeof signal<T>> {
  assertHookUsage("useSignal");
  return signal(initial);
}
