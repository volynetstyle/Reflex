import type { Ref } from "../types";

const noop = (): void => {};

export function attachRef<T>(el: T, ref: Ref<T> | undefined): () => void {
  if (!ref) return noop;

  if (typeof ref !== "function") {
    ref.current = el;

    return () => {
      ref.current = null;
    };
  }

  const cleanup = ref(el);

  return typeof cleanup === "function"
    ? () => {
        cleanup();
        ref(null);
      }
    : () => {
        ref(null);
      };
}
