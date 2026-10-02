import {
  createDOMRangeHandle,
  type DOMRangeHandle,
} from "../host/range-handle";
import { attachRef } from "../host/refs";
import { registerDOMCleanup } from "../runtime/lifetime";
import type { Ref } from "../types";

export function bindDOMRangeRef(
  ref: Ref<DOMRangeHandle> | undefined,
  start: Text | Comment,
  end: Text | Comment,
): void {
  if (!ref) return;
  const handle = createDOMRangeHandle(start, end);
  // Register before invoking user code, so a failed ref still closes the handle.
  registerDOMCleanup(() => handle.dispose());
  const detach = attachRef(handle, ref);
  registerDOMCleanup(detach);
}
