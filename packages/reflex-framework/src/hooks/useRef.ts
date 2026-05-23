import { assertHookUsage, consumeHookSlot, getCurrentHookScope } from "./context";

export interface RefObject<T> {
  current: T;
}

const scopeRefs = new WeakMap<object, RefObject<unknown>[]>();

export function useRef<T>(initial: T): RefObject<T> {
  assertHookUsage("useRef");

  const scope = getCurrentHookScope();
  if (scope === null) {
    return { current: initial };
  }

  const slot = consumeHookSlot();
  let refs = scopeRefs.get(scope);

  if (refs === undefined) {
    refs = [];
    scopeRefs.set(scope, refs);
  }

  const existing = refs[slot];
  if (existing !== undefined) {
    return existing as RefObject<T>;
  }

  const ref: RefObject<T> = { current: initial };
  refs[slot] = ref as RefObject<unknown>;
  return ref;
}
