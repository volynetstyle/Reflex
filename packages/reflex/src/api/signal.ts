import { readProducer, writeProducer } from "@reflex/runtime";
import { createSignalNode } from "../infra";

interface SignalOptions {
  name: string;
}

export function signal<T>(
  initialValue: T,
  options?: SignalOptions,
): readonly [value: Accessor<T>, setValue: Setter<T>] {
  const node = createSignalNode(initialValue);

  const value: Accessor<T> = () => readProducer(node);

  const setValue = function (this: void, input?: SetInput<T>): T {
    /* c8 ignore start -- dev-only diagnostics are compiled out in the test build */
    if (__DEV__) {
      if (arguments.length === 0) {
        let message = `Signal(${initialValue})`;

        if (options) {
          message = `${options.name}(${initialValue})`;
        }

        throw new TypeError(
          `[ERROR ${message}]: setValue() was called without an argument. 
          This is only valid for signals whose type includes undefined.`,
        );
      }
    }
    /* c8 ignore stop */

    const previous = node.payload;
    const next =
      typeof input !== "function" ? input : (<Updater<T>>input)(previous);

    writeProducer(node, next);
    return next as T;
  } as Setter<T>;

  return [value, setValue] as const;
}
