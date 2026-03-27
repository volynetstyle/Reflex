/* eslint-disable @typescript-eslint/no-explicit-any */
import { COMPONENT_RENDERABLE } from "../component";
import { ELEMENT_RENDERABLE } from "../element";
import {
  FOR_RENDERABLE,
  SHOW_RENDERABLE,
  SWITCH_RENDERABLE,
  type ForRenderable,
  type ShowRenderable,
  type SwitchRenderable,
} from "../operators";
import type {
  ComponentRenderable,
  ElementProps,
  ElementRenderable,
  ElementTag,
  JSXRenderable,
} from "../types";
import type { Namespace } from "../host/namespace";
import type { DOMRenderer } from "../runtime";
import { createDynamicRange } from "../structure/range";
import { createElement } from "./create-element";
import { mountFor } from "./for";
import { mountShow } from "./show";
import { createMountedSlot } from "./slot";
import { mountSwitch } from "./switch";
import { mountComponent } from "./component";

function isAccessor(value: unknown): value is () => unknown {
  return typeof value === "function";
}

function isIterable(value: unknown): value is Iterable<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    Symbol.iterator in value
  );
}

function getRenderableKind(value: unknown): unknown {
  return typeof value === "object" && value !== null
    ? (value as { kind?: unknown }).kind
    : undefined;
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

    if (Array.isArray(current) || isIterable(current)) {
      const items = Array.isArray(current) ? current : Array.from(current);

      // Push in reverse order to preserve original order.
      for (let i = items.length - 1; i >= 0; --i) {
        stack[top++] = items[i];
      }

      continue;
    }

    if (current instanceof Node) {
      parent.appendChild(current);
      continue;
    }

    if (isAccessor(current)) {
      const nodeRange = createDynamicRange(renderer, current, ns);
      parent.appendChild(nodeRange);
      continue;
    }

    switch (getRenderableKind(current)) {
      case ELEMENT_RENDERABLE:
        {
          const element = current as ElementRenderable<
            ElementTag,
            ElementProps<ElementTag>
          >;

        parent.appendChild(
          createElement(
            renderer,
            element.tag,
            element.props,
            ns,
          ),
        );
        continue;
        }

      case SHOW_RENDERABLE:
        parent.appendChild(
          mountShow(renderer, current as ShowRenderable<any>, ns),
        );
        continue;

      case SWITCH_RENDERABLE:
        parent.appendChild(
          mountSwitch(renderer, current as SwitchRenderable<any>, ns),
        );
        continue;

      case FOR_RENDERABLE:
        parent.appendChild(
          mountFor(
            renderer,
            current as ForRenderable<any>,
            ns,
            createMountedSlot,
          ),
        );
        continue;

      case COMPONENT_RENDERABLE:
        mountComponent(
          renderer,
          parent,
          current as ComponentRenderable<any>,
          ns,
        );
        continue;
    }

    parent.appendChild(doc.createTextNode(String(current)));
  }
}
