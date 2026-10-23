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

export function appendRenderableNodes(
  parent: Node,
  value: JSXRenderable | unknown,
  ns: Namespace,
): void {
  if (value == null || typeof value === "boolean") return;

  const doc = ownerDocument(parent);
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint"
  ) {
    parent.appendChild(doc.createTextNode(String(value)));
    return;
  }

  appendComplexNodes(parent, value, ns, doc);
}

function appendComplexNodes(
  parent: Node,
  value: unknown,
  ns: Namespace,
  doc: Document,
): void {
  let stack: unknown[] | undefined;
  let top = 0;
  let current: unknown = value;

  for (;;) {
    switch (classifyRenderable(current)) {
      case RenderableKind.Empty:
        break;
      case RenderableKind.Text:
        parent.appendChild(doc.createTextNode(String(current)));
        break;
      case RenderableKind.Array: {
        const values = Array.isArray(current)
          ? current
          : Array.from(current as Iterable<unknown>);
        if (values.length === 0) break;
        if (values.length > 1) {
          stack ??= [];
          for (let i = values.length - 1; i > 0; i--) stack[top++] = values[i];
        }
        current = values[0];
        continue;
      }
      case RenderableKind.Accessor:
        parent.appendChild(
          mountReactiveSlot(current as () => unknown, identity, ns, doc),
        );
        break;
      case RenderableKind.Node:
        parent.appendChild(current as Node);
        break;
      case RenderableKind.Element: {
        const el = current as ElementRenderable<
          ElementTag,
          ElementProps<ElementTag>
        >;
        parent.appendChild(mountElement(el.tag, el.props, ns, doc));
        break;
      }
      case RenderableKind.Show: {
        const r = current as ShowRenderable<unknown>;
        parent.appendChild(
          mountReactiveSlot(
            r.when,
            (v) => resolveShowValue(r, v),
            ns,
            doc,
            r.ref,
          ),
        );
        break;
      }
      case RenderableKind.Switch: {
        const r = current as SwitchRenderable<unknown>;
        parent.appendChild(
          mountReactiveSlot(r.value, (v) => resolveSwitchValue(r, v), ns, doc),
        );
        break;
      }
      case RenderableKind.For:
        parent.appendChild(
          mountFor(current as ForRenderable<unknown>, ns, doc),
        );
        break;
      case RenderableKind.Portal:
        parent.appendChild(mountPortal(current as PortalRenderable, doc));
        break;
      case RenderableKind.Component:
        mountComponent(parent, current as ComponentRenderable<unknown>, ns);
        break;
    }

    if (top === 0) return;
    current = stack![--top];
  }
}
