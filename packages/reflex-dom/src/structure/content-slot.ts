import { isDOMNode } from "../host/document";
import { clearBetween } from "../host/mutations";
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
  | { kind: "mounted"; range: OwnedRange }
  | { kind: "adopted" };

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

      case "adopted":
        break;
    }

    const parent = start.parentNode;
    if (parent !== null && end.parentNode === parent) {
      clearBetween(start, end);
    }

    state = { kind: "empty" };
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

export function adoptContentSlot(
  doc: Document,
  mountUnknown: MountContent,
  start: Comment,
  end: Comment,
): ContentSlot {
  const fragment = doc.createDocumentFragment();
  const initialState: ContentState =
    start.nextSibling === end ? { kind: "empty" } : { kind: "adopted" };

  return createSlotController(
    doc,
    mountUnknown,
    start,
    end,
    initialState,
    fragment,
  );
}
