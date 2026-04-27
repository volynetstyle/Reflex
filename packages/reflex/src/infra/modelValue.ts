declare const MODEL_ACTION_TYPE: unique symbol;

const modelActions = new WeakSet<Function>();

export type ModelActionBrand = {
  readonly [MODEL_ACTION_TYPE]: true;
};

export type ModelAction<TArgs extends unknown[] = unknown[], TReturn = unknown> =
  ((...args: TArgs) => TReturn) & ModelActionBrand;

export function createModelAction<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => TReturn,
): ModelAction<TArgs, TReturn> {
  modelActions.add(fn);
  return fn as ModelAction<TArgs, TReturn>;
}

export function isModelActionValue(
  value: unknown,
): value is ModelAction<unknown[], unknown> {
  return typeof value === "function" && modelActions.has(value);
}

export function isModelReadableValue(value: unknown): value is Accessor<unknown> {
  return (
    typeof value === "function" &&
    value.length === 0 &&
    !isModelActionValue(value)
  );
}

export function readModelValue<T>(
  value: T,
): T extends Accessor<infer TValue> ? TValue : T {
  return (isModelReadableValue(value) ? value() : value) as T extends Accessor<
    infer TValue
  >
    ? TValue
    : T;
}
