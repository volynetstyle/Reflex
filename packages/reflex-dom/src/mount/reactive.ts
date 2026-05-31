import type { Namespace } from "../host/namespace";
import {
  bindReactiveSlotLifecycle,
  createMountedSlot,
} from "../structure/reactive-slot";

export function mountReactiveSlot<T>(
  readValue: () => T,
  resolveValue: (value: T) => unknown,
  ns: Namespace,
): Node {
  const slot = createMountedSlot(resolveValue(readValue()), ns);
  bindReactiveSlotLifecycle(slot, readValue, resolveValue);

  return slot.fragment;
}
