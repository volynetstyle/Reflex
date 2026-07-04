import type { Namespace } from "../host/namespace";
import { runComponentRenderable } from "@volynets/reflex-framework";
import { getActiveDOMExecutionContext } from "../runtime/execution";
import type { ComponentRenderable } from "../types";
import { appendRenderableNodes } from "./append";

export function mountComponent(
  parent: Node,
  renderable: ComponentRenderable<unknown>,
  ns: Namespace,
): void {
  const context = getActiveDOMExecutionContext();

  runComponentRenderable(
    renderable,
    {
      owner: context.owner,
      renderEffectScheduler: context.renderEffectScheduler,
    },
    (value) => appendRenderableNodes(parent, value, ns),
  );
}
