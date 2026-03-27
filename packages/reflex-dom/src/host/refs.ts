import type { Ref } from "../types";

export function attachRef<T extends Element>(el: T, ref: Ref<T> | undefined) {
  if (!ref) return () => {};

  if (typeof ref === "function") {
    const cleanup = ref(el);

    return () => {
      cleanup?.();
      ref(null);
    };
  }

  ref.current = el;

  return () => {
    ref.current = null;
  };
}
