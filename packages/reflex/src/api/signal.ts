import { readProducer, writeProducer } from "@reflex/runtime";
import { createSignalNode } from "../infra";

/**
 * Creates writable reactive state.
 *
 * `signal` returns a tuple containing a tracked read accessor and a setter.
 * Reading the accessor inside `computed()`, `memo()`, or `effect()` registers
 * a dependency. Writing through the setter updates the stored value
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
 * @returns A readonly tuple:
 * - `value` - tracked accessor that returns the current signal value.
 * - `setValue` - setter that accepts either a direct value or an updater
 *   function receiving the previous value. The setter returns the committed
 *   next value.
 *
 * @example
 * ```ts
 * createRuntime();
 *
 * const [count, setCount] = signal(0);
 *
 * console.log(count()); // 0
 *
 * setCount(1);
 * setCount((prev) => prev + 1);
 *
 * console.log(count()); // 2
 * ```
 *
 * @remarks
 * - Reads are synchronous and always return the latest committed value.
 * - Same-value writes do not invalidate downstream computed values or effects.
 * - Calling `setValue()` with no argument is only valid when `T` includes
 *   `undefined`.
 * - In typical app code, call `createRuntime()` during setup before building
 *   the rest of the reactive graph.
 *
 * @see computed
 * @see memo
 * @see effect
 */
export function signal<T>(initialValue: T): readonly [Signal<T>, Setter<T>] {
  const node = createSignalNode(initialValue);

  function set(input: SetInput<T>) {
    const payload = node.payload;
    const next =
      typeof input === "function"
        ? (input as (prev: T) => T)(payload as T)
        : input;
    writeProducer(node, next);
  }

  return [
    readProducer.bind(null, node) as Signal<T>,
    set as Setter<T>,
  ] as const;
}
