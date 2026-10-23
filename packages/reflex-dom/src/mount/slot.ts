import type { Namespace } from "../host/namespace";
import { getDOMContext } from "../runtime/context";
import {
  createDOMOwnedReaction,
  registerDOMCleanup,
  runInDOMOwnershipNode,
} from "../runtime/lifetime";
import type { ContentSlot } from "../structure/content-slot";
import {
  adoptTextContentSlot,
  createContentSlot,
  hydrateContentSlot,
  type MountContent,
} from "../structure/content-slot";
import { isTextNode } from "../host/document";
import { isTextRenderableValue } from "../renderable/kind";
import { appendRenderableNodes } from "./append";
import { bindDOMRangeRef } from "./range-ref";
import type { DOMRangeHandle } from "../host/range-handle";
import type { Ref } from "../types";

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

/** Activates server-rendered nodes between two anchors; mismatches throw. */
export type HydrateContent = (
  value: unknown,
  first: Node | null,
  boundary: Node,
  ns: Namespace,
) => void;

export function createHydratedSlot(
  value: unknown,
  start: Comment,
  end: Comment,
  ns: Namespace,
  hydrateContent: HydrateContent,
): ContentSlot {
  const context = getDOMContext();
  const doc = start.ownerDocument;
  const mountContent: MountContent = (parent, ownershipNode, nextValue) => {
    runInDOMOwnershipNode(
      ownershipNode,
      () => {
        appendRenderableNodes(parent, nextValue, ns);
      },
      context,
    );
  };

  if (isTextRenderableValue(value)) {
    const text = String(value);
    let node = start.nextSibling;

    // The server emits no node for an empty string.
    if (node === end && text === "") {
      node = start.parentNode!.insertBefore(doc.createTextNode(""), end);
    }

    if (isTextNode(node) && node.nextSibling === end) {
      if (node.data !== text) node.data = text;
      return adoptTextContentSlot(doc, mountContent, start, end, node);
    }
  }

  return hydrateContentSlot(
    doc,
    mountContent,
    start,
    end,
    (ownershipNode) => {
      runInDOMOwnershipNode(
        ownershipNode,
        () => {
          const first = start.nextSibling === end ? null : start.nextSibling;
          hydrateContent(value, first, end, ns);
        },
        context,
      );
    },
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
  hydrateContent: HydrateContent,
  ref?: Ref<DOMRangeHandle>,
): void {
  const slot = createHydratedSlot(
    resolveValue(readValue()),
    start,
    end,
    ns,
    hydrateContent,
  );
  bindReactiveSlotLifecycle(slot, readValue, resolveValue);
  bindDOMRangeRef(ref, start, end);
}
