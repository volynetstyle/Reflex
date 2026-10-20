import { ownerDocument } from "../host/document";
import type {
  ForRenderable,
  PortalRenderable,
  ShowRenderable,
  SwitchRenderable,
} from "../operators";
import type {
  ComponentRenderable,
  ElementRenderable,
  ElementTag,
  JSXRenderable,
} from "../types";
import type { Namespace } from "../host/namespace";
import type { CompiledDOMRenderable } from "../renderable/compiled";
import { RenderableKind } from "../renderable/kind";
import { classifyRenderable } from "../renderable/classify";
import { mountComponent } from "./component";
import { mountReactiveSlot } from "./reactive";
import { mountElementChildAccessor } from "./text-binding";
import { mountCompiledHole } from "./compiled-hole";
import { compiledDOMMount } from "./compiled-bindings";
import { mountElement } from "./element";
import { mountFor } from "./for";
import { mountPortal } from "./portal";
import { resolveShowValue, resolveSwitchValue } from "../operators";

function identity<T>(value: T): T {
  return value;
}

function appendText(parent: Node, doc: Document, value: unknown): void {
  parent.appendChild(doc.createTextNode(value + ""));
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
  doc: Document = ownerDocument(parent),
): void {
  if (value == null || typeof value === "boolean") return;

  const kind = classifyRenderable(value);

  if (kind !== RenderableKind.Array) {
    appendClassified(parent, doc, value, kind, ns);
    return;
  }

  // Nested children are flattened with an explicit stack, not recursion.
  const stack: unknown[] = [];
  let top = pushReverse(stack, 0, toArray(value));

  while (top) {
    const current = stack[--top];
    const currentKind = classifyRenderable(current);

    if (currentKind === RenderableKind.Array) {
      top = pushReverse(stack, top, toArray(current));
    } else {
      appendClassified(parent, doc, current, currentKind, ns);
    }
  }
}

function toArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : Array.from(value as Iterable<unknown>);
}

function appendClassified(
  parent: Node,
  doc: Document,
  current: unknown,
  kind: RenderableKind,
  ns: Namespace,
): void {
  switch (kind) {
    case RenderableKind.Empty:
    case RenderableKind.Array:
      return;
    case RenderableKind.Text:
      appendText(parent, doc, current);
      return;
    case RenderableKind.Accessor:
      if (parent.nodeType === 1) {
        mountElementChildAccessor(
          parent as Element,
          current as () => unknown,
          ns,
          doc,
        );
        return;
      }
      parent.appendChild(
        mountReactiveSlot(current as () => unknown, identity, ns, doc),
      );
      return;
    case RenderableKind.Node:
      parent.appendChild(current as Node);
      return;
    case RenderableKind.Element: {
      const el = current as ElementRenderable<
        ElementTag,
        Record<string, unknown>
      >;
      parent.appendChild(mountElement(el.tag, el.props, ns, doc));
      return;
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
      return;
    }
    case RenderableKind.Switch: {
      const r = current as SwitchRenderable<unknown>;
      parent.appendChild(
        mountReactiveSlot(r.value, (v) => resolveSwitchValue(r, v), ns, doc),
      );
      return;
    }
    case RenderableKind.For:
      parent.appendChild(mountFor(current as ForRenderable<unknown>, ns, doc));
      return;
    case RenderableKind.Portal:
      parent.appendChild(mountPortal(current as PortalRenderable, doc));
      return;
    case RenderableKind.Component:
      mountComponent(parent, current as ComponentRenderable<unknown>, ns);
      return;
    case RenderableKind.Compiled: {
      const r = current as CompiledDOMRenderable;
      // Compiled regions are HTML-only; other namespaces mount the source tree.
      const node = ns === "html" ? r.create(doc, mountCompiledHole, compiledDOMMount) : null;
      if (node !== null) parent.appendChild(node);
      else appendRenderableNodes(parent, r.fallback(), ns, doc);
      return;
    }
  }
}
