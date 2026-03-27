import type { Namespace } from "../host/namespace";
import {
  createScope,
  runWithScope,
} from "../ownership";
import type { DOMRenderer } from "../runtime";
import type { ComponentRenderable } from "../types";
import { appendRenderableNodes } from "./create-nodes";

export function mountComponent(
  renderer: DOMRenderer,
  parent: Node,
  renderable: ComponentRenderable<unknown>,
  ns: Namespace,
): void {
  const scope = createScope();

  runWithScope(renderer.owner, scope, () => {
    appendRenderableNodes(
      renderer,
      parent,
      renderable.type(renderable.props),
      ns,
    );
  });
}
