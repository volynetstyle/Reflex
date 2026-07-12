import {
  createProducer,
  readProducer,
  writeProducer,
} from "@volynets/reflex-runtime";
import type { SetInput, SignalAccessor } from "../types/core";
import { assertHookUsage } from "./context";

const READ = Symbol("read");

export function useSignal<T>(initial: T): SignalAccessor<T> {
  assertHookUsage("useSignal");

  // `initial` is used only during hook creation.
  // Component hooks do not rerender in place today, so later `initial` values
  // are intentionally ignored for this ownership node lifetime.
  const node = createProducer(initial);

  function count(): T;
  function count(input: SetInput<T>): T;
  function count(input: SetInput<T> | typeof READ = READ): T {
    if (input === READ) return readProducer(node);

    const nextValue =
      typeof input === "function"
        ? (input as (previous: T) => T)(readProducer(node))
        : input;

    writeProducer(node, nextValue);
    return nextValue;
  }

  return count;
}
