import type { Ref } from "../types";

export function attachRef<T>(el: T, ref: Ref<T> | undefined) {
  if (!ref) return () => {};

  if (typeof ref === "function") {
    const cleanup = ref(el);

    return () => {
      if (cleanup) cleanup();
      ref(null);
    };
  }

  ref.current = el;

  return () => {
    ref.current = null;
  };
}
