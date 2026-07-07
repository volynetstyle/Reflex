import { runWithComponentExecution } from "../hooks";
import {
  usingOwnershipNode,
  type OwnerContext,
} from "../ownership/ownership.scope";
import type { ComponentRenderable, JSXRenderable } from "../types/renderable";

export interface ComponentExecutionOptions {
  owner: OwnerContext;
}

export function runComponentRenderable<P, Host, Result>(
  renderable: ComponentRenderable<P, Host>,
  options: ComponentExecutionOptions,
  consume: (value: JSXRenderable<Host>) => Result,
): Result {
  const { owner } = options;

  return usingOwnershipNode(owner, (node) => {
    const value = runWithComponentExecution(
      { owner, node },
      () => renderable.type(renderable.props),
    );

    return consume(value);
  });
}
