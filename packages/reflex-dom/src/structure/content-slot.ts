import { clearBetween } from "../host/mutations";
import {
  createScope,
  disposeScope,
  type Scope,
} from "reflex-framework/ownership";

export type MountUnknown = (parent: Node, scope: Scope, value: unknown) => void;

type ContentState =
  | { kind: "empty" }
  | { kind: "text"; node: Text; value: string }
  | { kind: "node"; node: Node }
  | { kind: "fallback"; scope: Scope };

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

  function unmountCurrent(): void {
    if (state.kind === "fallback") {
      disposeScope(state.scope);
    }

    const parent = start.parentNode;
    if (parent !== null && end.parentNode === parent) {
      clearBetween(start, end);
    }

    state = { kind: "empty" };
  }

  function mount(parent: Node, value: unknown): void {
    if (isEmptyValue(value)) {
      state = { kind: "empty" };
      return;
    }

    if (isTextValue(value)) {
      const text = doc.createTextNode(value + "");
      parent.insertBefore(text, end);
      state = {
        kind: "text",
        node: text,
        value: text.data,
      };
      return;
    }

    if (isSingleNodeValue(value)) {
      parent.insertBefore(value, end);
      state = {
        kind: "node",
        node: value,
      };
      return;
    }

    const scope = createScope();
    const content = doc.createDocumentFragment();
    mountUnknown(content, scope, value);
    parent.insertBefore(content, end);
    state = {
      kind: "fallback",
      scope,
    };
  }

  if (initialValue !== NO_INITIAL_VALUE) {
    mount(fragment, initialValue);
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
        if (state.kind !== "empty") {
          unmountCurrent();
        }
        return;
      }

      if (isTextValue(value)) {
        const next = value + "";

        if (state.kind === "text") {
          if (state.value !== next) {
            state.node.data = next;
            state.value = next;
          }
          return;
        }

        unmountCurrent();
        mount(parent, next);
        return;
      }

      if (isSingleNodeValue(value)) {
        if (state.kind === "node" && state.node === value) {
          return;
        }

        unmountCurrent();
        mount(parent, value);
        return;
      }

      unmountCurrent();
      mount(parent, value);
    },

    dispose(): void {
      if (destroyed) return;
      if (state.kind !== "empty") {
        unmountCurrent();
      }
    },

    destroy(): void {
      if (destroyed) return;

      unmountCurrent();
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
    start.nextSibling === end
      ? { kind: "empty" }
      : { kind: "fallback", scope: createScope() };

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
