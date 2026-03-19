import { runtime } from "./setup";
import { createRuntime as createRuntimeImpl } from "@reflex/runtime";
import type {
  BatchWriteEntry,
  Computed,
  EffectScope,
  Runtime,
  RuntimeOptions,
  Signal,
} from "./public-types";

export type {
  BatchWriteEntry,
  Computed,
  EffectScope,
  Runtime,
  RuntimeOptions,
  Signal,
} from "./public-types";

export function createRuntime(options?: RuntimeOptions): Runtime {
  return createRuntimeImpl(options as never) as Runtime;
}

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

export function batchWrite(writes: ReadonlyArray<BatchWriteEntry>) {
  runtime.batchWrite(writes);
}

export { runtime };

