import type { Namespace } from "../host/namespace";
import { getDOMContext } from "../runtime/context";
import {
  createDOMOwnedReaction,
  registerDOMCleanup,
  runInDOMOwnershipNode,
} from "../runtime/lifetime";
import type { ContentSlot } from "../structure/content-slot";
import { adoptContentSlot, createContentSlot } from "../structure/content-slot";
import { appendRenderableNodes } from "./append";

export function createMountedSlot(
  value: unknown,
  ns: Namespace,
  doc: Document,
): ContentSlot {
  const context = getDOMContext();

  return createContentSlot(
    doc,
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
  const context = getDOMContext();

  return adoptContentSlot(
    start.ownerDocument,
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
