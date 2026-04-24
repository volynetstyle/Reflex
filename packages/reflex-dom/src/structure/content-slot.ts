import { clearBetween } from "../host/mutations";
import {
  createScope,
  disposeScope,
  type Scope,
} from "@volynets/reflex-framework";

export type MountUnknown = (parent: Node, scope: Scope, value: unknown) => void;

type ContentState =
  | { kind: "empty" }
  | { kind: "text"; node: Text; value: string }
  | { kind: "node"; node: Node }
  | { kind: "mounted"; scope: Scope }
  | { kind: "adopted" };

export interface ContentSlot {
  fragment: DocumentFragment;
  start: Comment;
  end: Comment;
  update(value: unknown): void;
  dispose(): void;
  destroy(): void;
}

const NO_INITIAL_VALUE = Symbol("no-initial-value");

function isEmptyValue(value: unknown): boolean {
  return value == null || typeof value === "boolean";
}

function isTextValue(value: unknown): value is string | number | bigint {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint"
  );
}

function isSingleNodeValue(value: unknown): value is Node {
  return (
    value instanceof Node && value.nodeType !== Node.DOCUMENT_FRAGMENT_NODE
  );
}

function createSlotController(
  doc: Document,
  mountUnknown: MountUnknown,
  start: Comment,
  end: Comment,
  initialState: ContentState,
  initialValue: unknown | typeof NO_INITIAL_VALUE,
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
    const scope = createScope();
    const content = doc.createDocumentFragment();

    mountUnknown(content, scope, value);
    parent.insertBefore(content, end);

    state = { kind: "mounted", scope };
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
        disposeScope(state.scope);
        break;

      case "adopted":
        break;
    }

    const parent = start.parentNode;
    if (parent !== null && end.parentNode === parent) {
      clearBetween(start, end);
    }

    state = { kind: "empty" };
  }

  function mountInitial(value: unknown): void {
    if (isEmptyValue(value)) {
      state = { kind: "empty" };
      return;
    }

    if (isTextValue(value)) {
      mountText(fragment, String(value));
      return;
    }

    if (isSingleNodeValue(value)) {
      mountNode(fragment, value);
      return;
    }

    mountFallback(fragment, value);
  }

  if (initialValue !== NO_INITIAL_VALUE) {
    mountInitial(initialValue);
  }

  return {
    fragment,
    start,
    end,

    update(value: unknown): void {
      if (destroyed) return;

      const parent = end.parentNode;
      if (parent === null) return;

      if (isEmptyValue(value)) {
        clearCurrent();
        return;
      }

      if (isTextValue(value)) {
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

    dispose(): void {
      if (destroyed) return;
      clearCurrent();
    },

    destroy(): void {
      if (destroyed) return;

      clearCurrent();
      start.remove();
      end.remove();
      destroyed = true;
    },
  };
}

export function createContentSlot(
  doc: Document,
  mountUnknown: MountUnknown,
  initialValue: unknown,
): ContentSlot {
  const fragment = doc.createDocumentFragment();
  const start = doc.createComment("");
  const end = doc.createComment("");

  fragment.appendChild(start);
  fragment.appendChild(end);

  return createSlotController(
    doc,
    mountUnknown,
    start,
    end,
    { kind: "empty" },
    initialValue,
    fragment,
  );
}

export function adoptContentSlot(
  doc: Document,
  mountUnknown: MountUnknown,
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
    NO_INITIAL_VALUE,
    fragment,
  );
}
