import type { Namespace } from "../host/namespace";
import { registerCleanup } from "reflex-framework/ownership";
import {
  onEffectStart,
  runInOwnershipScope,
  useEffect,
} from "reflex-framework/ownership/reflex";
import type { DOMRenderer } from "../runtime";
import type { ContentSlot } from "./content-slot";
import { adoptContentSlot, createContentSlot } from "./content-slot";
import { appendRenderableNodes } from "../mount/append";

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

export function createHydratedSlot(
  renderer: DOMRenderer,
  start: Comment,
  end: Comment,
  ns: Namespace,
): ContentSlot {
  return adoptContentSlot(
    document,
    (parent, scope, nextValue) => {
      runInOwnershipScope(renderer.owner, scope, () => {
        appendRenderableNodes(renderer, parent, nextValue, ns);
      });
    },
    start,
    end,
  );
}

export function bindReactiveSlotLifecycle<T>(
  renderer: DOMRenderer,
  slot: ContentSlot,
  readValue: () => T,
  resolveValue: (value: T) => unknown,
): void {
  useEffect(renderer.owner, () => {
    const nextValue = readValue();

    onEffectStart(() => {
      slot.update(resolveValue(nextValue));
    });
  });

  registerCleanup(renderer.owner, () => {
    slot.destroy();
  });
}

export function hydrateReactiveSlot<T>(
  renderer: DOMRenderer,
  readValue: () => T,
  resolveValue: (value: T) => unknown,
  start: Comment,
  end: Comment,
  ns: Namespace,
): void {
  const slot = createHydratedSlot(renderer, start, end, ns);
  bindReactiveSlotLifecycle(renderer, slot, readValue, resolveValue);
}
