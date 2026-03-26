import { COMPONENT_RENDERABLE } from "../component";
import { ELEMENT_RENDERABLE } from "../element";
import type {
  ComponentRenderable,
  ElementRenderable,
  JSXRenderable,
} from "../types";
import type { Namespace } from "../host/namespace";
import type { DOMRenderer } from "../runtime";
import {
  createScope,
  disposeScope,
  registerCleanup,
  runWithScope,
} from "../ownership";
import { createDynamicRange } from "../structure/range";
import { createElement } from "./create-element";

function isAccessor(value: unknown): value is () => unknown {
  return typeof value === "function";
}

function isComponentRenderable(value: unknown): value is ComponentRenderable<any> {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    (value as { kind?: unknown }).kind === COMPONENT_RENDERABLE
  );
}

function isElementRenderable(value: unknown): value is ElementRenderable {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    (value as { kind?: unknown }).kind === ELEMENT_RENDERABLE
  );
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
      for (let i = current.length - 1; i >= 0; --i) {
        stack[top++] = current[i];
      }

      continue;
    }

    if (current instanceof Node) {
      parent.appendChild(current);
      continue;
    }

    if (isElementRenderable(current)) {
      parent.appendChild(
        createElement(renderer, current.tag, current.props, ns),
      );
      continue;
    }

    if (isAccessor(current)) {
      const nodeRange = createDynamicRange(renderer, current, ns);
      parent.appendChild(nodeRange);
      continue;
    }

    if (isComponentRenderable(current)) {
      const scope = createScope();

      registerCleanup(renderer.owner, () => {
        disposeScope(scope);
      });

      runWithScope(renderer.owner, scope, () => {
        appendRenderableNodes(renderer, parent, current.type(current.props), ns);
      });
      continue;
    }

    parent.appendChild(doc.createTextNode(String(current)));
  }
}
