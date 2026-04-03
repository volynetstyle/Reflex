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
import { RenderableKind, classifyRenderable } from "./renderable";
import type { DOMRenderer } from "../runtime";
import { mountComponent } from "./component";
import { identity, mountReactiveSlot } from "./reactive-slot";
import { mountElement } from "./element";
import { mountFor } from "./for";
import { mountPortal } from "./portal";
import { mountShow } from "./show";
import { mountSwitch } from "./switch";

export function appendRenderableNodes(
  renderer: DOMRenderer,
  parent: Node,
  value: JSXRenderable | unknown,
  ns: Namespace,
): void {
  if (value == null || typeof value === "boolean") {
    return;
  }

  let top = 1;
  const stack: unknown[] = [value];
  const doc = parent.ownerDocument!;

  while (top > 0) {
    const current = stack[--top];

    switch (classifyRenderable(current)) {
      case RenderableKind.Empty:
        continue;

      case RenderableKind.Array: {
        const items = Array.isArray(current)
          ? current
          : Array.from(current as Iterable<unknown>);

        for (let i = items.length - 1; i >= 0; ++top, --i) {
          stack[top] = items[i];
        }

        continue;
      }

      case RenderableKind.Node:
        parent.appendChild(current as Node);
        continue;

      case RenderableKind.Accessor:
        parent.appendChild(
          mountReactiveSlot(renderer, current as () => unknown, identity, ns),
        );
        continue;

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
        parent.appendChild(
          mountPortal(renderer, current as PortalRenderable),
        );
        continue;

      case RenderableKind.Component:
        mountComponent(
          renderer,
          parent,
          current as ComponentRenderable<any>,
          ns,
        );
        continue;

      case RenderableKind.Text:
        parent.appendChild(doc.createTextNode(String(current)));
        continue;
    }
  }
}
