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


export function signal<T>(value: T): Signal<T> {
  const node = createSignalNode(value);

  function accessor(v?: T) {
    if (v === undefined && arguments.length === 0) return readProducer(node);
    writeProducer(node, v as T);
  }

  accessor.untracked = () => node.payload;
  accessor.node = node;

  return accessor as Signal<T>;
}

export function computed<T>(fn: () => T): Computed<T> {
  const node = createComputedNode(fn);

  function accessor() {
    return readConsumer(node);
  }

  accessor.untracked = () => node.payload;
  accessor.node = node;

  return accessor as Computed<T>;
}

/** Computed, вычисленный немедленно. */
export function memo<T>(fn: () => T): Computed<T> {
  const c = computed(fn);
  c();
  return c;
}