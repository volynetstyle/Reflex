import type { Namespace } from "../host/namespace";
import {
  createDOMOwnedReaction,
  getActiveDOMExecutionContext,
  registerDOMCleanup,
  runInDOMOwnershipNode,
} from "../runtime/execution";
import type { ContentSlot } from "./content-slot";
import { adoptContentSlot, createContentSlot } from "./content-slot";
import { appendRenderableNodes } from "../mount/append";

export function createMountedSlot(
  value: unknown,
  ns: Namespace,
): ContentSlot {
  const context = getActiveDOMExecutionContext();

  return createContentSlot(
    document,
    (parent, ownershipNode, nextValue) => {
      runInDOMOwnershipNode(
        ownershipNode,
        () => {
          appendRenderableNodes(parent, nextValue, ns);
        },
        context,
      );
    },
    value,
  );
}

export function createHydratedSlot(
  start: Comment,
  end: Comment,
  ns: Namespace,
): ContentSlot {
  const context = getActiveDOMExecutionContext();

  return adoptContentSlot(
    document,
    (parent, ownershipNode, nextValue) => {
      runInDOMOwnershipNode(
        ownershipNode,
        () => {
          appendRenderableNodes(parent, nextValue, ns);
        },
        context,
      );
    },
    start,
    end,
  );
}

export function bindReactiveSlotLifecycle<T>(
  slot: ContentSlot,
  readValue: () => T,
  resolveValue: (value: T) => unknown,
): void {
  createDOMOwnedReaction(readValue, (nextValue) => {
    slot.update(resolveValue(nextValue));
  });

  registerDOMCleanup(() => {
    slot.destroy();
  });
}

export function hydrateReactiveSlot<T>(
  readValue: () => T,
  resolveValue: (value: T) => unknown,
  start: Comment,
  end: Comment,
  ns: Namespace,
): void {
  const slot = createHydratedSlot(start, end, ns);
  bindReactiveSlotLifecycle(slot, readValue, resolveValue);
}
