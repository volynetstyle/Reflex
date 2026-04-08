import type { Namespace } from "../host/namespace";
import type { DOMRenderer } from "../runtime";
import {
  bindReactiveSlotLifecycle,
  createMountedSlot,
} from "../structure/reactive-slot";

export function mountReactiveSlot<T>(
  renderer: DOMRenderer,
  readValue: () => T,
  resolveValue: (value: T) => unknown,
  ns: Namespace,
): Node {
  const slot = createMountedSlot(renderer, resolveValue(readValue()), ns);
  bindReactiveSlotLifecycle(renderer, slot, readValue, resolveValue);

  return slot.fragment;
}
