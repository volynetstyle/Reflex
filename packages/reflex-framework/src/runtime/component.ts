import { runWithComponentHooks, type RenderEffectScheduler } from "../hooks";
import { disposeOwnershipNode } from "../ownership/ownership.cleanup";
import {
  createOwnershipNode,
  runWithOwnershipNode,
  type OwnerContext,
} from "../ownership/ownership.scope";
import type { ComponentRenderable, JSXRenderable } from "../types/renderable";

export interface ComponentExecutionOptions {
  owner: OwnerContext;
  renderEffectScheduler?: RenderEffectScheduler | null;
}

export function runComponentRenderable<P, Host, Result>(
  renderable: ComponentRenderable<P, Host>,
  options: ComponentExecutionOptions,
  consume: (value: JSXRenderable<Host>) => Result,
): Result {
  const { owner, renderEffectScheduler } = options;
  const node = createOwnershipNode();

  try {
    return runWithOwnershipNode(owner, node, () =>
      consume(
        runWithComponentHooks(
          { owner, node, renderEffectScheduler },
          () => renderable.type(renderable.props),
        ),
      ),
    );
  } catch (error) {
    disposeOwnershipNode(node);
    throw error;
  }
}
