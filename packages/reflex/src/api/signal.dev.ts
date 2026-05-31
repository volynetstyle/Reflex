export function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as PromiseLike<T>).then === "function"
  );
}

export function devassertSetterReceivedPromise<T>(input: SetInput<T>): void {
  if (!__DEV__) return;

  if (isPromiseLike<T>(input)) {
    throw new TypeError(
      "[signal.setter(input)] Setter received a Promise-like object. " +
        "Signals are synchronous; pass a resolved value instead.",
    );
  }
}

export function devassertSetterReturn<T>(result: T): void {
  if (!__DEV__) return;

  if (result === undefined) {
    console.warn(
      "[signal.setter(callback)] Updater returned undefined. " +
        "If this was intentional, ignore this warning. Otherwise, you may have forgotten to return a value.",
    );
  }

  if (isPromiseLike<T>(result)) {
    throw new TypeError(
      "[signal.setter(callback)] Updater returned a Promise-like object. " +
        "Signal updaters must be synchronous.",
    );
  }
}
