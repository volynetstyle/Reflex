import { signal } from "@volynets/reflex";

export function useSignal<T>(initial: T): ReturnType<typeof signal<T>> {
  return signal(initial);
}
