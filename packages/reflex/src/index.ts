import { runtime } from "./setup";

export {
  createRuntime,
  recycling,
} from "@reflex/runtime";
export type {
  BatchWriteEntry,
  Computed,
  EffectScope,
  Runtime,
  RuntimeOptions,
  Signal,
} from "@reflex/runtime";

export * from "@reflex/core";

export function signal<T>(value: T) {
  return runtime.signal(value);
}

export function computed<T>(fn: () => T) {
  return runtime.computed(fn);
}

export function memo<T>(fn: () => T) {
  return runtime.memo(fn);
}

export function effect(fn: () => void | (() => void)) {
  return runtime.effect(fn);
}

export function flush() {
  runtime.flush();
}

export function batchWrite(
  writes: ReadonlyArray<readonly [import("@reflex/runtime").Signal<unknown>, unknown]>,
) {
  runtime.batchWrite(writes);
}

export { runtime };

