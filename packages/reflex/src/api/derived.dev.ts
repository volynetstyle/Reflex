function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as PromiseLike<T>).then === "function"
  );
}

export function devassertDerivedFn(
  fn: unknown,
  kind: "computed" | "memo",
): asserts fn is () => unknown {
  if (!__DEV__) return;

  if (typeof fn !== "function") {
    throw new TypeError(
      `[${kind}(fn)] Expected a synchronous function, got ${typeof fn}.`,
    );
  }
}

export function devassertDerivedReturn<T>(
  result: T,
  kind: "computed" | "memo",
): void {
  if (!__DEV__) return;

  if (result === undefined) {
    console.warn(
      `[${kind}(fn)] Computation returned undefined. ` +
        "If this was intentional, ignore this warning. Otherwise, you may have forgotten to return a value.",
    );
  }

  if (isPromiseLike<T>(result)) {
    throw new TypeError(
      `[${kind}(fn)] Computation returned a Promise-like object. ` +
        "Derived reactive values must be synchronous.",
    );
  }
}

/**
 * @deprecated
 * 
 * @param fn 
 * @param kind 
 * @returns 
 */
export function wrapDerivedFn<T>(
  fn: () => T,
  kind: "computed" | "memo",
): () => T {
  if (!__DEV__) return fn;

  return () => {
    const result = fn();

    devassertDerivedReturn(result, kind);

    return result;
  };
}
