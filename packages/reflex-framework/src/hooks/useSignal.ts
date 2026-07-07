import {
  createProducer,
  readProducer,
  writeProducer,
} from "@volynets/reflex-runtime";
import type { SetInput, Setter, Signal } from "../types/core";
import { assertHookUsage } from "./context";

type SignalTuple<T> = readonly [Signal<T>, Setter<T>];

export function useSignal<T>(initial: T): SignalTuple<T> {
  assertHookUsage("useSignal");

  // `initial` is used only during hook creation.
  // Component hooks do not rerender in place today, so later `initial` values
  // are intentionally ignored for this ownership node lifetime.
  const node = createProducer(initial);
  const read = (() => readProducer(node)) as Signal<T>;

  Object.defineProperty(read, "value", {
    enumerable: true,
    get: read,
  });

  const set: Setter<T> = (input: SetInput<T>) => {
    const next =
      typeof input === "function"
        ? (input as (previous: T) => T)(readProducer(node))
        : input;
    writeProducer(node, next);
  };

  return [read, set] as const;
}
