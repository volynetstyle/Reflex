import { Ref } from "../types";

export function attachRef<T extends Element>(el: T, ref: Ref<T> | undefined) {
  if (!ref) return () => {};
  if (typeof ref === "function") {
    ref(el);
    return () => ref(null);
  } else {
    ref.current = el;
    
    return () => {
      ref.current = null;
    };
  }
}
