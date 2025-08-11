export type Result<T, E> =
  | { success: true; value: T }
  | { success: false; error: E };

export type ResultWithMeta<T, E, M = unknown> = Result<T, E> & {
  meta?: M;
};

export function hasError<T, E>(
  result: Result<T, E>
): result is { success: false; error: E } {
  return result.success === false;
}

const Result = {
  ok: <T, E = never>(value: T): Result<T, E> => ({ success: true, value }),

  err: <T = never, E = unknown>(error: E): Result<T, E> => ({
    success: false,
    error,
  }),

  map: <T, E, U>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> =>
    result.success ? Result.ok(fn(result.value)) : result,

  flatMap: <T, E, U>(
    result: Result<T, E>,
    fn: (value: T) => Result<U, E>
  ): Result<U, E> => (result.success ? fn(result.value) : result),

  getOrElse: <T, E>(result: Result<T, E>, defaultValue: T): T =>
    result.success ? result.value : defaultValue,
};
