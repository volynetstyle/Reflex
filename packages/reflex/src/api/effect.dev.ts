
export function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as PromiseLike<T>).then === "function"
  );
}

export function devassertEffectFn(
  fn: unknown,
  kind: "effect" | "effectRanked",
): asserts fn is EffectFn {
  if (!__DEV__) return;

  if (typeof fn !== "function") {
    throw new TypeError(
      `[${kind}(fn)] Expected a synchronous function, got ${typeof fn}.`,
    );
  }
}

export function devassertEffectReturn(
  result: void | Destructor,
  kind: "effect" | "effectRanked",
): void {
  if (!__DEV__) return;

  if (result === undefined) return;

  if (typeof result === "function") return;

  if (isPromiseLike(result)) {
    throw new TypeError(
      `[${kind}(fn)] Effect returned a Promise-like object. ` +
        "Effects must be synchronous. Start async work inside the effect, but do not return the Promise.",
    );
  }

  throw new TypeError(
    `[${kind}(fn)] Effect returned ${typeof result}. ` +
      "Expected void or a cleanup function.",
  );
}

export function wrapEffectFn(
  fn: EffectFn,
  kind: "effect" | "effectRanked",
): EffectFn {
  if (!__DEV__) return fn;

  return () => {
    const result = fn();

    devassertEffectReturn(result, kind);

    return result;
  };
}

export function devassertSelectorFn<T>(
  fn: unknown,
  kind: "reaction" | "watch",
): asserts fn is () => T {
  if (!__DEV__) return;

  if (typeof fn !== "function") {
    throw new TypeError(
      `[${kind}(read)] Expected a synchronous selector function, got ${typeof fn}.`,
    );
  }
}

type ReactionFn<T> = (value: T, prev: T) => void;

export function devassertReactionFn<T>(
  fn: unknown,
  kind: "reaction" | "watch",
): asserts fn is ReactionFn<T> {
  if (!__DEV__) return;

  if (typeof fn !== "function") {
    throw new TypeError(
      `[${kind}.subscribe(fn)] Expected a synchronous subscriber function, got ${typeof fn}.`,
    );
  }
}

export function devassertSelectorReturn<T>(
  result: T,
  kind: "reaction" | "watch",
): void {
  if (!__DEV__) return;

  if (isPromiseLike(result)) {
    throw new TypeError(
      `[${kind}(read)] Selector returned a Promise-like object. ` +
        "Watched selectors must be synchronous.",
    );
  }
}

export function devassertReactionReturn(
  result: unknown,
  kind: "reaction" | "watch",
): void {
  if (!__DEV__) return;

  if (result === undefined) return;

  if (isPromiseLike(result)) {
    throw new TypeError(
      `[${kind}.subscribe(fn)] Subscriber returned a Promise-like object. ` +
        "Reaction subscribers must be synchronous and should not return cleanup.",
    );
  }

  throw new TypeError(
    `[${kind}.subscribe(fn)] Subscriber returned ${typeof result}. ` +
      "Expected void.",
  );
}