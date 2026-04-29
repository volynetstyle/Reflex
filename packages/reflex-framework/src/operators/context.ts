import type { Component, ComponentRenderable } from "../types/renderable";

export const COMPONENT_RENDERABLE = Symbol.for("reflex.component");

export function createComponentRenderable<P, Host = never>(
  type: Component<P, Host>,
  props: P,
): ComponentRenderable<P, Host> {
  return {
    kind: COMPONENT_RENDERABLE,
    type,
    props,
  };
}
