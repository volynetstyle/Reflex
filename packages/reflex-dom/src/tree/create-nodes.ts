import type { JSXRenderable } from "../types";
import type { Namespace } from "../host/namespace";
import type { DOMRenderer } from "../runtime";
import { createDynamicRange } from "../structure/range";

function isAccessor(value: unknown): value is () => unknown {
  return typeof value === "function";
}

export function appendRenderableNodes(
  renderer: DOMRenderer,
  parent: Node,
  value: JSXRenderable | unknown,
  ns: Namespace,
): void {
  if (value == null || typeof value === "boolean") {
    return;
  }

  let top = 0;
  const stack: unknown[] = [value];
  ++top;
  const doc = parent.ownerDocument!;

  while (top > 0) {
    const current = stack[--top];

    if (current == null || typeof current === "boolean") {
      continue;
    }

    if (Array.isArray(current)) {
      // Push in reverse order to preserve original order
      for (let i = top - 1; i >= 0; --i) {
        stack[top++] = current[i];
      }

      continue;
    }

    if (value instanceof Node) {
      parent.appendChild(value);
      return;
    }

    if (isAccessor(value)) {
      const nodeRange = createDynamicRange(renderer, value, ns);
      parent.appendChild(nodeRange);
      return;
    }

    parent.appendChild(doc.createTextNode(String(current)));
  }
}
