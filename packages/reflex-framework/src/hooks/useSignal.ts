import { signal } from "@volynets/reflex";
import { assertHookUsage } from "./context";

type SignalTuple<T> = ReturnType<typeof signal<T>>;

export function useSignal<T>(initial: T): SignalTuple<T> {
  assertHookUsage("useSignal");

  // `initial` is used only during hook creation.
  // Component hooks do not rerender in place today, so later `initial` values
  // are intentionally ignored for this ownership node lifetime.
  return signal(initial);
}