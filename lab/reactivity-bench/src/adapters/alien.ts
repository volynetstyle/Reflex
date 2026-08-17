import {
  computed,
  effect,
  endBatch,
  signal,
  startBatch,
} from "alien-signals";
import type { ReactiveBenchApi } from "../types.js";

export function createAlienApi(): ReactiveBenchApi {
  const disposers: Array<() => void> = [];

  return {
    signal<T>(initial: T) {
      const value = signal(initial);
      return { read: value, write: value };
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
    batch<T>(fn: () => T): T {
      startBatch();
      try {
        return fn();
      } finally {
        endBatch();
      }
    },
    flush() {},
    dispose() {
      for (let index = disposers.length - 1; index >= 0; index--) {
        disposers[index]!();
      }
      disposers.length = 0;
    },
  };
}
