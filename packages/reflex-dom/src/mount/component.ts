import type { Namespace } from "../host/namespace";
import { createScope, runInOwnershipScope } from "@volynets/reflex-framework";
import type { DOMRenderer } from "../runtime/renderer";
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
