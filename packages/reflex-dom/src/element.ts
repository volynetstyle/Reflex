import type { DOMProps, ElementRenderable } from "./types";

export const ELEMENT_RENDERABLE = Symbol.for("reflex-dom.element");

export function createElementRenderable(
  tag: string,
  props: DOMProps,
): ElementRenderable {
  return {
    kind: ELEMENT_RENDERABLE,
    tag,
    props,
  };
}
