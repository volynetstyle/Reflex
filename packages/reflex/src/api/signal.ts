import type { ProducerNode } from "@volynets/reflex-runtime/internal";
import {
  createProducer,
  readProducer,
  writeProducer,
} from "@volynets/reflex-runtime/internal";
import {
  devassertSetterReceivedPromise,
  devassertSetterReturn,
} from "./signal.dev";

/**
 * Creates writable reactive state.
 *
 * `signal` returns a tracked callable accessor with `.set`.
 * Reading it inside `computed()`, `memo()`, or `effect()` registers
 * a dependency. Writing through `.set` updates the stored value
 * synchronously and invalidates downstream reactive consumers only when the
 * value actually changes.
 *
 * @typeParam T - Signal value type.
 *
 * @param initialValue - Initial signal value returned until a later write
 * replaces it.
 * @param options - Optional development diagnostics. `options.name` is used
 * only in development builds when formatting setter error messages.
 *
 * @returns A tracked accessor. Call it to read and call `.set` with either a
 * direct value or an updater function receiving the previous value.
 *
 * @example
 * ```ts
 * createRuntime();
 *
 * const count = signal(0);
 *
 * console.log(count()); // 0
 *
 * count.set(1);
 * count.set((prev) => prev + 1);
 *
 * console.log(count()); // 2
 * ```
 *
 * @remarks
 * - Reads are synchronous and always return the latest committed value.
 * - Same-value writes do not invalidate downstream computed values or effects.
 * - Calling `.set()` with no argument is only valid when `T` includes
 *   `undefined`.
 * - In typical app code, call `createRuntime()` during setup before building
 *   the rest of the reactive graph.
 *
 * @see computed
 * @see memo
 * @see effect
 */

export function signal<T>(initialValue: T): Signal<T> {
  const node = createProducer(initialValue);
  const read = (() => readProducer(node)) as Signal<T>;

  read.set = setter.bind(node) as Setter<T>;

  return read;
}

function setter<T>(this: ProducerNode<T>, input: SetInput<T>) {
  devassertSetterReceivedPromise(input);

  const next =
    typeof input === "function"
      ? (input as (prev: T) => T)(this.payload as T)
      : input;

  devassertSetterReturn(next);

  writeProducer(this, next);
}
