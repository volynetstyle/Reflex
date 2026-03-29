import type {
  ElementInstance,
  ElementProps,
  ElementTag,
} from "../types";
import type { DOMRenderer } from "../runtime";
import { SVG_NS, resolveNamespace, type Namespace } from "../host/namespace";
import { createElementBinder } from "./element-binder";
import { appendRenderableNodes } from "./append";

function createHostElement(
  tag: string,
  ns: Namespace,
  doc: Document,
): Element {
  return ns === "svg"
    ? doc.createElementNS(SVG_NS, tag)
    : doc.createElement(tag);
}

function mountProps(
  renderer: DOMRenderer,
  el: Element,
  props: Record<string, unknown>,
  ns: Namespace,
): void {
  createElementBinder(renderer, el, ns).bindProps(props);
}

function mountChildren(
  renderer: DOMRenderer,
  el: Element,
  children: unknown,
  ns: Namespace,
): void {
  appendRenderableNodes(renderer, el, children, ns);
}

export function mountElement<Tag extends ElementTag>(
  renderer: DOMRenderer,
  tag: Tag,
  props: ElementProps<Tag>,
  parentNamespace: Namespace,
): ElementInstance<Tag> {
  const ns = resolveNamespace(tag, parentNamespace);
  const doc = document;
  const el = createHostElement(tag, ns, doc) as ElementInstance<Tag>;

  mountProps(renderer, el, props as Record<string, unknown>, ns);
  mountChildren(renderer, el, props.children ?? null, ns);

  return el;
}
