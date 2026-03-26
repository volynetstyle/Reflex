import type { DOMProps, Ref } from "../types";
import type { DOMRenderer } from "../runtime";
import { bindReactiveProp } from "../bindings/reactive-prop";
import { isEventProp, attachEventListener } from "../host/events";
import { SVG_NS, resolveNamespace, type Namespace } from "../host/namespace";
import { applyProp } from "../host/props";
import { attachRef } from "../host/refs";
import { registerCleanup } from "../ownership";
import { appendRenderableNodes } from "./create-nodes";

const enum PropKind {
  Skip = 0,
  Event = 1,
  Reactive = 2,
  Static = 3,
}

function isAccessor(value: unknown): value is () => unknown {
  return typeof value === "function";
}

function resolvePropKind(name: string, value: unknown): PropKind {
  if (name === "children" || name === "ref" || value === undefined) {
    return PropKind.Skip;
  }

  if (isEventProp(name, value)) {
    return PropKind.Event;
  }

  if (isAccessor(value)) {
    return PropKind.Reactive;
  }

  return PropKind.Static;
}

function createHostElement(
  tag: string,
  ns: Namespace,
  doc: Document,
): Element {
  return ns === "svg"
    ? doc.createElementNS(SVG_NS, tag)
    : doc.createElement(tag);
}

function mountProp(
  renderer: DOMRenderer,
  el: Element,
  ns: Namespace,
  name: string,
  value: unknown,
): void {
  switch (resolvePropKind(name, value)) {
    case PropKind.Skip:
      return;

    case PropKind.Event:
      registerCleanup(
        renderer.owner,
        attachEventListener(
          el,
          name,
          value as EventListenerOrEventListenerObject,
        ),
      );
      return;

    case PropKind.Reactive:
      bindReactiveProp(renderer, el, name, value as () => unknown, ns);
      return;

    case PropKind.Static:
      applyProp(el, name, value, ns, undefined);
      return;
  }
}

function mountProps(
  renderer: DOMRenderer,
  el: Element,
  props: DOMProps,
  ns: Namespace,
): void {
  for (const name in props) {
    mountProp(renderer, el, ns, name, props[name]);
  }
}

function mountChildren(
  renderer: DOMRenderer,
  el: Element,
  children: unknown,
  ns: Namespace,
): void {
  appendRenderableNodes(renderer, el, children, ns);
}

function mountRef(
  renderer: DOMRenderer,
  el: Element,
  ref: Ref<Element> | undefined,
): void {
  if (ref !== undefined) {
    registerCleanup(renderer.owner, attachRef(el, ref));
  }
}

export function createElement(
  renderer: DOMRenderer,
  tag: string,
  props: DOMProps,
  parentNamespace: Namespace,
): Element {
  const ns = resolveNamespace(tag, parentNamespace);
  const doc = document;
  const el = createHostElement(tag, ns, doc);

  mountProps(renderer, el, props, ns);
  mountChildren(renderer, el, props.children ?? null, ns);
  mountRef(renderer, el, props.ref as Ref<Element> | undefined);

  return el;
}