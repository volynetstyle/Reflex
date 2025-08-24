type Result<T, E> =
  | { success: true; value: T }
  | { success: false; error: E };

const ok = <T, E = never>(value: T): Result<T, E> => ({
  success: true,
  value,
});

const err = <T = never, E = unknown>(error: E): Result<T, E> => ({
  success: false,
  error,
});

const map = <T, E, U>(
  result: Result<T, E>,
  fn: (value: T) => U
): Result<U, E> => {
  if (result.success) {
    return ok(fn(result.value));
  }

  return { success: false, error: result.error };
};

const flatMap = <T, E, U>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> => {
  if (result.success) {
    return fn(result.value);
  }
  
  return { success: false, error: result.error };
};

const getOrElse = <T, E>(
  result: Result<T, E>,
  defaultValue: T
): T => (result.success ? result.value : defaultValue);

export default {
  ok,
  err,
  map,
  flatMap,
  getOrElse,
} as const;
export type { Result };