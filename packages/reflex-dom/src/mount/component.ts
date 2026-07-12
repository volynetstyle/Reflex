import { runComponentRenderable } from "@volynets/reflex-framework";
import { appendRenderableNodes } from "./append";
import { getActiveDOMExecutionContext } from "../runtime/execution";
import type { Namespace } from "../host/namespace";
import type { ComponentRenderable } from "../types";

export function mountComponent(
  parent: Node,
  renderable: ComponentRenderable<unknown>,
  ns: Namespace,
): void {
  const context = getActiveDOMExecutionContext();

  runComponentRenderable(
    renderable,
    { owner: context.owner },
    (value) => appendRenderableNodes(parent, value, ns),
  );
}
