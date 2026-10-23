import { isDOMNode } from "../host/document";
import { createOwnedRange, type OwnedRange } from "./owned-range";
import {
  isEmptyRenderableValue,
  isTextRenderableValue,
} from "../renderable/kind";
import {
  createOwnershipNode,
  disposeOwnershipNode,
  type OwnershipNode,
} from "@volynets/reflex-framework";

export type MountContent = (
  parent: Node,
  ownershipNode: OwnershipNode,
  value: unknown,
) => void;

type ContentState =
  | { kind: "empty" }
  | { kind: "text"; node: Text; value: string }
  | { kind: "node"; node: Node }
  | { kind: "mounted"; range: OwnedRange };

export interface ContentSlot {
  fragment: DocumentFragment;
  start: Comment;
  end: Comment;
  update(value: unknown): void;
  destroy(): void;
}

function isSingleNodeValue(value: unknown): value is Node {
  return isDOMNode(value) && value.nodeType !== 11;
}

function createSlotController(
  doc: Document,
  mountUnknown: MountContent,
  start: Comment,
  end: Comment,
  initialState: ContentState,
  fragment: DocumentFragment,
): ContentSlot {
  let destroyed = false;
  let state: ContentState = initialState;

  function mountText(parent: Node, value: string): void {
    const node = doc.createTextNode(value);
    parent.insertBefore(node, end);
    state = { kind: "text", node, value };
  }

  function mountNode(parent: Node, node: Node): void {
    parent.insertBefore(node, end);
    state = { kind: "node", node };
  }

  function mountFallback(parent: Node, value: unknown): void {
    const ownershipNode = createOwnershipNode();
    const content = doc.createDocumentFragment();

    try {
      mountUnknown(content, ownershipNode, value);
      parent.insertBefore(content, end);
      state = {
        kind: "mounted",
        range: createOwnedRange(ownershipNode, {
          startAnchor: start,
          endAnchor: end,
        }),
      };
    } catch (error) {
      disposeOwnershipNode(ownershipNode);
      throw error;
    }
  }

  function clearCurrent(): void {
    switch (state.kind) {
      case "empty":
        return;

      case "text":
      case "node":
        const node = state.node;
        const parent = node.parentNode;
        if (parent !== null) {
          parent.removeChild(node);
        }
        state = { kind: "empty" };
        return;

      case "mounted":
        const range = state.range;
        state = { kind: "empty" };
        range.clear();
        return;
    }
  }

  return {
    fragment,
    start,
    end,

    update(value: unknown): void {
      if (destroyed) return;

      const parent = end.parentNode;
      if (parent === null) return;

      if (isEmptyRenderableValue(value)) {
        clearCurrent();
        return;
      }

      if (isTextRenderableValue(value)) {
        const next = String(value);

        if (state.kind === "text") {
          if (state.value !== next) {
            state.node.data = next;
            state.value = next;
          }
          return;
        }

        clearCurrent();
        mountText(parent, next);
        return;
      }

      if (isSingleNodeValue(value)) {
        if (state.kind === "node" && state.node === value) {
          return;
        }

        clearCurrent();
        mountNode(parent, value);
        return;
      }

      clearCurrent();
      mountFallback(parent, value);
    },

    destroy(): void {
      if (destroyed) return;

      destroyed = true;
      clearCurrent();
      start.remove();
      end.remove();
    },
  };
}

export function createContentSlot(
  doc: Document,
  mountUnknown: MountContent,
  initialValue: unknown,
): ContentSlot {
  const fragment = doc.createDocumentFragment();
  const start = doc.createComment("");
  const end = doc.createComment("");

  fragment.appendChild(start);
  fragment.appendChild(end);

  const slot = createSlotController(
    doc,
    mountUnknown,
    start,
    end,
    { kind: "empty" },
    fragment,
  );
  try {
    slot.update(initialValue);
    return slot;
  } catch (error) {
    slot.destroy();
    throw error;
  }
}

/**
 * Takes over one server-rendered text node as text state, so later text
 * values update it in place exactly like a client-mounted text slot.
 */
export function adoptTextContentSlot(
  doc: Document,
  mountUnknown: MountContent,
  start: Comment,
  end: Comment,
  node: Text,
): ContentSlot {
  return createSlotController(
    doc,
    mountUnknown,
    start,
    end,
    { kind: "text", node, value: node.data },
    doc.createDocumentFragment(),
  );
}

/**
 * Takes over server-rendered content between `start` and `end`. `hydrate`
 * activates it under its own ownership node, so the first update disposes
 * the hydrated subtree exactly like a client-mounted one.
 */
export function hydrateContentSlot(
  doc: Document,
  mountUnknown: MountContent,
  start: Comment,
  end: Comment,
  hydrate: (ownershipNode: OwnershipNode) => void,
): ContentSlot {
  const ownershipNode = createOwnershipNode();

  try {
    hydrate(ownershipNode);
  } catch (error) {
    disposeOwnershipNode(ownershipNode);
    throw error;
  }

  return createSlotController(
    doc,
    mountUnknown,
    start,
    end,
    {
      kind: "mounted",
      range: createOwnedRange(ownershipNode, {
        startAnchor: start,
        endAnchor: end,
      }),
    },
    doc.createDocumentFragment(),
  );
}
