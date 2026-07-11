import {
  createConsumer,
  createProducer,
  readConsumerLazy,
  readProducer,
  writeProducer,
} from "@volynets/reflex-runtime";
import { getActiveDOMRuntime } from "../src/runtime/singleton";

export function signal<T>(initial: T) {
  const runtime = getActiveDOMRuntime();
  const node = runtime.run(() => createProducer(initial));
  const read = () => readProducer(node);
  const write = (input: T | ((previous: T) => T)) =>
    runtime.batch(() => {
      const next =
        typeof input === "function"
          ? (input as (previous: T) => T)(readProducer(node))
          : input;
      writeProducer(node, next);
    });
  return [read, write] as const;
}

export function computed<T>(fn: () => T) {
  const runtime = getActiveDOMRuntime();
  const node = runtime.run(() => createConsumer(fn));
  return () => runtime.run(() => readConsumerLazy.call(node));
}

export const memo = computed;
