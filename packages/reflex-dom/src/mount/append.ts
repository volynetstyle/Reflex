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
import type { DOMRenderer } from "../runtime/renderer";
import { mountComponent } from "./component";
import { mountReactiveSlot } from "./reactive";
import { mountElement } from "./element";
import { mountFor } from "./for";
import { mountPortal } from "./portal";
import { mountShow } from "./show";
import { mountSwitch } from "./switch";

function identity<T>(value: T): T {
  return value;
}

function pushValuesOntoStack(
  stack: unknown[],
  stackTop: number,
  values: readonly unknown[],
): number {
  for (let index = values.length - 1; index >= 0; index--) {
    stack[stackTop++] = values[index];
  }

  return stackTop;
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

  let stackTop = 1;
  const stack: unknown[] = [value];
  const doc = parent.ownerDocument!;

  while (stackTop > 0) {
    const current = stack[--stackTop];

    if (current == null || typeof current === "boolean") {
      continue;
    }

    if (isTextRenderableValue(current)) {
      parent.appendChild(doc.createTextNode(String(current)));
      continue;
    }

    if (Array.isArray(current)) {
      stackTop = pushValuesOntoStack(stack, stackTop, current);
      continue;
    }

    if (typeof current === "function") {
      parent.appendChild(
        mountReactiveSlot(renderer, current as () => unknown, identity, ns),
      );
      continue;
    }

    if (typeof current !== "object") {
      parent.appendChild(doc.createTextNode(String(current)));
      continue;
    }

    if (current instanceof Node) {
      parent.appendChild(current);
      continue;
    }

    const taggedRenderableKind = getTaggedRenderableKind(current);

    if (taggedRenderableKind !== undefined) {
      switch (taggedRenderableKind) {
        case RenderableKind.Element: {
          const element = current as ElementRenderable<
            ElementTag,
            ElementProps<ElementTag>
          >;

          parent.appendChild(
            mountElement(renderer, element.tag, element.props, ns),
          );
          continue;
        }

        case RenderableKind.Show:
          parent.appendChild(
            mountShow(renderer, current as ShowRenderable<any>, ns),
          );
          continue;

        case RenderableKind.Switch:
          parent.appendChild(
            mountSwitch(renderer, current as SwitchRenderable<any>, ns),
          );
          continue;

        case RenderableKind.For:
          parent.appendChild(
            mountFor(renderer, current as ForRenderable<any>, ns),
          );
          continue;

        case RenderableKind.Portal:
          parent.appendChild(mountPortal(renderer, current as PortalRenderable));
          continue;

        case RenderableKind.Component:
          mountComponent(
            renderer,
            parent,
            current as ComponentRenderable<any>,
            ns,
          );
          continue;

        case RenderableKind.Empty:
        case RenderableKind.Array:
        case RenderableKind.Node:
        case RenderableKind.Accessor:
        case RenderableKind.Text:
          break;
      }
    }

    if (Symbol.iterator in current) {
      stackTop = pushValuesOntoStack(
        stack,
        stackTop,
        Array.from(current as Iterable<unknown>),
      );
      continue;
    }

    parent.appendChild(doc.createTextNode(String(current)));
  }
}
