import { untracked } from "@volynets/reflex-runtime/internal";
import { transaction } from "./collections";

/** Wrap one synchronous logical state change, preserving arguments and receiver. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function action<F extends (...args: any[]) => any>(
  callback: F & (ReturnType<F> extends PromiseLike<unknown> ? never : unknown),
): F {
  if (Object.prototype.toString.call(callback) === "[object AsyncFunction]")
    throw new TypeError("action() requires a synchronous callback");
  let receiver: ThisParameterType<F>;
  let arguments_: Parameters<F>;
  // Reuse executors; save/restore the frame for recursion and eager re-entry.
  const invoke = () => {
    const result = callback.apply(receiver, arguments_);
    if (result && typeof result.then === "function")
      throw new TypeError("action() cannot return a promise");
    return result as ReturnType<F>;
  };
  const execute = () => transaction(invoke);
  return function (
    this: ThisParameterType<F>,
    ...args: Parameters<F>
  ): ReturnType<F> {
    const previousReceiver = receiver;
    const previousArguments = arguments_;
    receiver = this;
    arguments_ = args;
    try {
      return untracked(execute);
    } finally {
      receiver = previousReceiver;
      arguments_ = previousArguments;
    }
  } as F;
}
