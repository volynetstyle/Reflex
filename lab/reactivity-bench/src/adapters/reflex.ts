import {
  batch,
  computed,
  createRuntime,
  effect,
  signal,
} from "@volynets/reflex";
import type { ReactiveBenchApi } from "../types.js";

export function createReflexApi(): ReactiveBenchApi {
  const runtime = createRuntime({ effectStrategy: "eager" });
  const disposers: Array<() => void> = [];

  return {
    signal<T>(initial: T) {
      const value = signal(initial);
      return {
        read: value,
        write: (next: T) => void (value.set as (input: T) => unknown)(next),
      };
    },
    computed<T>(fn: () => T) {
      const value = computed(fn);
      return { read: value };
    },
    effect(fn) {
      const stop = effect(fn);
      disposers.push(stop);
      return stop;
    },
    batch,
    flush: runtime.flush,
    dispose() {
      for (let index = disposers.length - 1; index >= 0; index--) {
        disposers[index]!();
      }
      disposers.length = 0;
    },
  };
}
