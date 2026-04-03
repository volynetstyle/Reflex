import type { Namespace } from "../host/namespace";
import { createScope } from "reflex-framework/ownership";
import { runInOwnershipScope } from "reflex-framework/ownership/reflex";
import type { DOMRenderer } from "../runtime";
import type { ComponentRenderable } from "../types";
import { appendRenderableNodes } from "./append";

export function mountComponent(
  renderer: DOMRenderer,
  parent: Node,
  renderable: ComponentRenderable<unknown>,
  ns: Namespace,
): void {
  runInOwnershipScope(renderer.owner, createScope(), () => {
    appendRenderableNodes(
      renderer,
      parent,
      renderable.type(renderable.props),
      ns,
    );
  });
}
