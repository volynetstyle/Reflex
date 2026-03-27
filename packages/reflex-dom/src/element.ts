import type {
  ElementProps,
  ElementRenderable,
  ElementTag,
} from "./types";

export const ELEMENT_RENDERABLE = Symbol.for("reflex-dom.element");

export function createElementRenderable<Tag extends ElementTag>(
  tag: Tag,
  props: ElementProps<Tag>,
): ElementRenderable<Tag, ElementProps<Tag>> {
  return {
    kind: ELEMENT_RENDERABLE,
    tag,
    props,
  };
}
