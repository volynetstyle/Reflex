import { ownerDocument } from "../host/document";
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
import { RenderableKind } from "../renderable/kind";
import { classifyRenderable } from "../renderable/classify";
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

export function appendRenderableNodes(
  parent: Node,
  value: JSXRenderable | unknown,
  ns: Namespace,
): void {
  if (value == null || typeof value === "boolean") return;

  const doc = ownerDocument(parent);
  const stack: unknown[] = [value];
  let top = 1;

  while (top) {
    const current = stack[--top];

    switch (classifyRenderable(current)) {
      case RenderableKind.Empty:
        continue;
      case RenderableKind.Text:
        appendText(parent, doc, current);
        continue;
      case RenderableKind.Array:
        top = pushReverse(
          stack,
          top,
          Array.isArray(current)
            ? current
            : Array.from(current as Iterable<unknown>),
        );
        continue;
      case RenderableKind.Accessor:
        parent.appendChild(
          mountReactiveSlot(current as () => unknown, identity, ns, doc),
        );
        continue;
      case RenderableKind.Node:
        parent.appendChild(current as Node);
        continue;
      case RenderableKind.Element: {
        const el = current as ElementRenderable<
          ElementTag,
          ElementProps<ElementTag>
        >;

        parent.appendChild(mountElement(el.tag, el.props, ns, doc));
        continue;
      }

      case RenderableKind.Show: {
        const r = current as ShowRenderable<unknown>;
        parent.appendChild(
          mountReactiveSlot(r.when, (v) => resolveShowValue(r, v), ns, doc),
        );
        continue;
      }

      case RenderableKind.Switch: {
        const r = current as SwitchRenderable<unknown>;
        parent.appendChild(
          mountReactiveSlot(r.value, (v) => resolveSwitchValue(r, v), ns, doc),
        );
        continue;
      }

      case RenderableKind.For:
        parent.appendChild(
          mountFor(current as ForRenderable<unknown>, ns, doc),
        );
        continue;

      case RenderableKind.Portal:
        parent.appendChild(mountPortal(current as PortalRenderable, doc));
        continue;

      case RenderableKind.Component:
        mountComponent(parent, current as ComponentRenderable<unknown>, ns);
        continue;
    }
  }
}
