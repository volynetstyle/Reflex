export const MODEL_ACTION = Symbol("MODEL_ACTION");
export const MODEL_READABLE = Symbol("MODEL_READABLE");

export type ModelActionBrand = {
  readonly [MODEL_ACTION]: true;
};

export type ModelAction<TArgs extends unknown[] = unknown[], TReturn = unknown> =
  ((...args: TArgs) => TReturn) & ModelActionBrand;

export function markModelAction<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => TReturn,
): ModelAction<TArgs, TReturn> {
  Object.defineProperty(fn, MODEL_ACTION, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  return fn as ModelAction<TArgs, TReturn>;
}

export function markModelReadable<T extends Accessor<unknown>>(fn: T): T {
  Object.defineProperty(fn, MODEL_READABLE, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  return fn;
}

export function isModelActionValue(
  value: unknown,
): value is ModelAction<unknown[], unknown> {
  return (
    typeof value === "function" &&
    (value as { [MODEL_ACTION]?: true })[MODEL_ACTION] === true
  );
}

export function isModelReadableValue(value: unknown): value is Accessor<unknown> {
  return (
    typeof value === "function" &&
    (value as { [MODEL_READABLE]?: true })[MODEL_READABLE] === true
  );
}
