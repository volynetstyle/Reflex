import { clearBetween } from "../host/mutations";
import { createScope, disposeScope, type Scope } from "../ownership";

export type MountUnknown = (parent: Node, scope: Scope, value: unknown) => void;

type ContentState =
  | {
      kind: "empty";
      scope: null;
    }
  | {
      kind: "text";
      scope: null;
      node: Text;
      value: string;
    }
  | {
      kind: "node";
      scope: null;
      node: Node;
    }
  | {
      kind: "fallback";
      scope: Scope;
    };

export interface ContentSlot {
  fragment: DocumentFragment;
  start: Comment;
  end: Comment;
  update(value: unknown): void;
  dispose(): void;
  destroy(): void;
}

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

function disposeState(state: ContentState): void {
  if (state.scope !== null) {
    disposeScope(state.scope);
  }
}

export function createContentSlot(
  doc: Document,
  mountUnknown: MountUnknown,
  initialValue: unknown,
): ContentSlot {
  const start = doc.createComment("");
  const end = doc.createComment("");
  const fragment = doc.createDocumentFragment();

  let destroyed = false;
  let state: ContentState = { kind: "empty", scope: null };
  function mountIntoParent(parent: Node, value: unknown): void {
    if (isEmptyValue(value)) {
      state = { kind: "empty", scope: null };
      return;
    }

    if (isTextValue(value)) {
      const node = doc.createTextNode(String(value));
      parent.appendChild(node);
      state = {
        kind: "text",
        scope: null,
        node,
        value: node.data,
      };
      return;
    }

    if (isSingleNodeValue(value)) {
      parent.appendChild(value);
      state = {
        kind: "node",
        scope: null,
        node: value,
      };
      return;
    }

    const scope = createScope();
    mountUnknown(parent, scope, value);
    state = {
      kind: "fallback",
      scope,
    };
  }

  function mountInitialState(parent: Node, value: unknown): void {
    parent.appendChild(start);
    mountIntoParent(parent, value);
    parent.appendChild(end);
  }

  mountInitialState(fragment, initialValue);

  function clearMountedContent(): void {
    disposeState(state);

    const parent = start.parentNode;
    if (parent !== null && end.parentNode === parent) {
      clearBetween(start, end);
    }

    state = { kind: "empty", scope: null };
  }

  function updateText(parent: Node, value: string): void {
    if (state.kind === "text") {
      if (state.value !== value) {
        state.node.data = value;
        state.value = value;
      }
      return;
    }

    clearMountedContent();

    const node = doc.createTextNode(value);
    parent.insertBefore(node, end);
    state = {
      kind: "text",
      scope: null,
      node,
      value,
    };
  }

  function updateNode(parent: Node, value: Node): void {
    if (state.kind === "node" && state.node === value) {
      return;
    }

    clearMountedContent();
    parent.insertBefore(value, end);
    state = {
      kind: "node",
      scope: null,
      node: value,
    };
  }

  function updateFallback(parent: Node, value: unknown): void {
    clearMountedContent();

    const nextScope = createScope();
    const nextFragment = doc.createDocumentFragment();
    mountUnknown(nextFragment, nextScope, value);
    parent.insertBefore(nextFragment, end);
    state = {
      kind: "fallback",
      scope: nextScope,
    };
  }

  return {
    fragment,
    start,
    end,
    update(value) {
      if (destroyed) return;

      const parent = end.parentNode;
      if (parent === null) return;

      if (isEmptyValue(value)) {
        clearMountedContent();
        return;
      }

      if (isTextValue(value)) {
        updateText(parent, String(value));
        return;
      }

      if (isSingleNodeValue(value)) {
        updateNode(parent, value);
        return;
      }

      updateFallback(parent, value);
    },

    dispose() {
      if (destroyed) return;
      clearMountedContent();
    },
    
    destroy() {
      if (destroyed) return;

      clearMountedContent();
      start.parentNode?.removeChild(start);
      end.parentNode?.removeChild(end);
      destroyed = true;
    },
  };
}
