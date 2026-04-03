import type { Namespace } from "../host/namespace";
import { registerCleanup } from "reflex-framework/ownership";
import {
  onEffectStart,
  runInOwnershipScope,
  useEffect,
} from "reflex-framework/ownership/reflex";
import type { DOMRenderer } from "../runtime";
import type { ContentSlot } from "../structure/content-slot";
import { createContentSlot } from "../structure/content-slot";
import { appendRenderableNodes } from "./append";

function identity<T>(value: T): T {
  return value;
}

export function createMountedSlot(
  renderer: DOMRenderer,
  value: unknown,
  ns: Namespace,
): ContentSlot {
  return createContentSlot(
    document,
    (parent, scope, nextValue) => {
      runInOwnershipScope(renderer.owner, scope, () => {
        appendRenderableNodes(renderer, parent, nextValue, ns);
      });
    },
    value,
  );
}

export function mountReactiveSlot<T>(
  renderer: DOMRenderer,
  readValue: () => T,
  resolveValue: (value: T) => unknown,
  ns: Namespace,
): Node {
  const slot = createMountedSlot(renderer, resolveValue(readValue()), ns);

  useEffect(renderer.owner, () => {
    const nextValue = readValue();

    onEffectStart(() => {
      slot.update(resolveValue(nextValue));
    });
  });

  registerCleanup(renderer.owner, () => {
    slot.destroy();
  });

  return slot.fragment;
}

export { identity };
