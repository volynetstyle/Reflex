import type {
  ElementInstance,
  ElementProps,
  ElementTag,
} from "../types";
import type { DOMRenderer } from "../runtime";
import { SVG_NS, resolveNamespace, type Namespace } from "../host/namespace";
import { bindElementProps } from "./element-binder";
import { appendRenderableNodes } from "./append";

export function mountElement<Tag extends ElementTag>(
  renderer: DOMRenderer,
  tag: Tag,
  props: ElementProps<Tag>,
  parentNamespace: Namespace,
): ElementInstance<Tag> {
  const ns = resolveNamespace(tag, parentNamespace);
  const doc = document;
  const el = (
    ns === "svg"
      ? doc.createElementNS(SVG_NS, tag)
      : doc.createElement(tag)
  ) as unknown as ElementInstance<Tag>;

  bindElementProps(renderer, el, props as Record<string, unknown>, ns);
  appendRenderableNodes(renderer, el, props.children, ns);

  return el;
}
