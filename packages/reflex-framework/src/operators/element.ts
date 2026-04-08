import type { ElementRenderable } from "../types/renderable";

export const ELEMENT_RENDERABLE = Symbol.for("reflex.element");

export function createElementRenderable<Tag extends string, Props>(
  tag: Tag,
  props: Props,
): ElementRenderable<Tag, Props> {
  return {
    kind: ELEMENT_RENDERABLE,
    tag,
    props,
  };
}
