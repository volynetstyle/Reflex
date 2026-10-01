import type { Namespace } from "../host/namespace";
import { bindReactiveSlotLifecycle, createMountedSlot } from "../mount/slot";

export function mountReactiveSlot<T>(
  readValue: () => T,
  resolveValue: (value: T) => unknown,
  ns: Namespace,
  doc: Document,
): Node {
  const slot = createMountedSlot(resolveValue(readValue()), ns, doc);
  bindReactiveSlotLifecycle(slot, readValue, resolveValue);

  return slot.fragment;
}
