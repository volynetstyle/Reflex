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
