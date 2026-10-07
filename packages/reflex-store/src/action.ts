import { untracked } from "@volynets/reflex-runtime/internal";
import { transaction } from "./collections";

/** Wrap one synchronous logical state change, preserving arguments and receiver. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function action<F extends (...args: any[]) => any>(
  callback: F & (ReturnType<F> extends PromiseLike<unknown> ? never : unknown),
): F {
  if (Object.prototype.toString.call(callback) === "[object AsyncFunction]")
    throw new TypeError("action() requires a synchronous callback");
  return function (
    this: ThisParameterType<F>,
    ...args: Parameters<F>
  ): ReturnType<F> {
    return untracked(() =>
      transaction(() => {
        const result = callback.apply(this, args);
        if (result && typeof result.then === "function")
          throw new TypeError("action() cannot return a promise");
        return result;
      }),
    );
  } as F;
}
