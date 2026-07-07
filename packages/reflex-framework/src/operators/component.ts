import type { AttributeKey } from "src/types/core";
import {
  COMPONENT_RENDERABLE,
  type Component,
  type ComponentRenderable,
} from "../types/renderable";

export { COMPONENT_RENDERABLE };

export function createComponentRenderable<P, Host>(
  type: Component<P, Host>,
  props: P,
  key?: AttributeKey,
): ComponentRenderable<P, Host> {
  return {
    kind: COMPONENT_RENDERABLE,
    type,
    props,
    key: key ?? null,
  };
}