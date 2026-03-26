import type { Component, ComponentRenderable } from "./types";

export const COMPONENT_RENDERABLE = Symbol.for("reflex-dom.component");

export function createComponentRenderable<P>(
  type: Component<P>,
  props: P,
): ComponentRenderable<P> {
  return {
    kind: COMPONENT_RENDERABLE,
    type,
    props,
  };
}
