import type { Namespace } from "../host/namespace";
import { bindReactiveSlotLifecycle, createMountedSlot } from "../mount/slot";
import { bindDOMRangeRef } from "./range-ref";
import type { DOMRangeHandle } from "../host/range-handle";
import type { Ref } from "../types";

export function mountReactiveSlot<T>(
  readValue: () => T,
  resolveValue: (value: T) => unknown,
  ns: Namespace,
  doc: Document,
  ref?: Ref<DOMRangeHandle>,
): Node {
  const slot = createMountedSlot(resolveValue(readValue()), ns, doc);
  bindReactiveSlotLifecycle(slot, readValue, resolveValue);
  bindDOMRangeRef(ref, slot.start, slot.end);

  return slot.fragment;
}
