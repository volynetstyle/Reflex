/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  ForRenderable,
  PortalRenderable,
  ShowRenderable,
  SwitchRenderable,
} from "../operators";
import type {
  ComponentRenderable,
  ElementProps,
  ElementRenderable,
  ElementTag,
  JSXRenderable,
} from "../types";
import type { Namespace } from "../host/namespace";
import {
  RenderableKind,
  getTaggedRenderableKind,
  isTextRenderableValue,
} from "../renderable/kind";
import { mountComponent } from "./component";
import { mountReactiveSlot } from "./reactive";
import { mountElement } from "./element";
import { mountFor } from "./for";
import { mountPortal } from "./portal";
import { resolveShowValue, resolveSwitchValue } from "../operators";

function identity<T>(value: T): T {
  return value;
}

function appendText(parent: Node, doc: Document, value: unknown): void {
  parent.appendChild(doc.createTextNode(String(value)));
}

function pushReverse(
  stack: unknown[],
  top: number,
  values: readonly unknown[],
): number {
  for (let i = values.length; i-- > 0; ) stack[top++] = values[i];
  return top;
}

function mountSlot<T>(
  accessor: () => T,
  map: (value: T) => unknown,
  ns: Namespace,
): Node {
  return mountReactiveSlot(accessor, map, ns);
}

export function appendRenderableNodes(
  parent: Node,
  value: JSXRenderable | unknown,
  ns: Namespace,
): void {
  if (value == null || typeof value === "boolean") return;

  const doc = parent.ownerDocument!;
  const stack: unknown[] = [value];
  let top = 1;

  while (top) {
    const current = stack[--top];

    if (current == null || typeof current === "boolean") continue;

    if (isTextRenderableValue(current)) {
      appendText(parent, doc, current);
      continue;
    }

    if (Array.isArray(current)) {
      top = pushReverse(stack, top, current);
      continue;
    }

    if (typeof current === "function") {
      parent.appendChild(mountSlot(current as () => unknown, identity, ns));
      continue;
    }

    if (typeof current !== "object") {
      appendText(parent, doc, current);
      continue;
    }

    if (current instanceof parent.ownerDocument!.defaultView!.Node) {
      parent.appendChild(current);
      continue;
    }

    switch (getTaggedRenderableKind(current)) {
      case RenderableKind.Element: {
        const el = current as ElementRenderable<
          ElementTag,
          ElementProps<ElementTag>
        >;

        parent.appendChild(mountElement(el.tag, el.props, ns));
        continue;
      }

      case RenderableKind.Show: {
        const r = current as ShowRenderable<any>;
        parent.appendChild(
          mountSlot(r.when, (v) => resolveShowValue(r, v), ns),
        );
        continue;
      }

      case RenderableKind.Switch: {
        const r = current as SwitchRenderable<any>;
        parent.appendChild(
          mountSlot(r.value, (v) => resolveSwitchValue(r, v), ns),
        );
        continue;
      }

      case RenderableKind.For:
        parent.appendChild(mountFor(current as ForRenderable<any>, ns));
        continue;

      case RenderableKind.Portal:
        parent.appendChild(mountPortal(current as PortalRenderable));
        continue;

      case RenderableKind.Component:
        mountComponent(parent, current as ComponentRenderable<any>, ns);
        continue;
    }

    if (isIterable(current)) {
      top = pushReverse(stack, top, Array.from(current));
      continue;
    }
    
    appendText(parent, doc, current);
  }
}

function isIterable(value: unknown): value is Iterable<unknown> {
  return value != null && typeof (value as any)[Symbol.iterator] === "function";
}
