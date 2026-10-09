/** Small runtime assertions keep the corpus independent of a test runner. */
export function same(
  actual: unknown,
  expected: unknown,
  message = "Unexpected value",
): void {
  if (!Object.is(actual, expected))
    throw new Error(
      `${message}: expected ${String(expected)}, got ${String(actual)}`,
    );
}

export function equal(
  actual: ReadonlyArray<string | number>,
  expected: ReadonlyArray<string | number>,
): void {
  if (
    actual.length !== expected.length ||
    actual.some((value, i) => !Object.is(value, expected[i]))
  )
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
}

export function ok(value: unknown): asserts value {
  if (!value) throw new Error("Expected a truthy value");
}

export function throws(
  expression: () => unknown,
  errorType: new () => Error,
): void {
  try {
    expression();
  } catch (error) {
    if (error instanceof errorType) return;
    throw error;
  }
  throw new Error(`Expected ${errorType.name} to be thrown`);
}
