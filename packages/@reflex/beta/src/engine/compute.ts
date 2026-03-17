import { EngineContext, ReactiveNode, clearDirtyState } from "../core";
import { executeNodeComputation } from "./execute";

function commitComputedValue(
  ctx: EngineContext,
  node: ReactiveNode,
  prevValue: unknown,
  newValue: unknown,
): boolean {
  node.payload = newValue;
  node.v = ctx.getEpoch();
  clearDirtyState(node);

  const changed = !Object.is(prevValue, newValue);

  if (changed) {
    node.t = node.v;
  }

  return changed;
}

export function recompute(ctx: EngineContext, node: ReactiveNode): boolean {
  if (!node.compute) return false;

  const prevValue = node.payload;
  return executeNodeComputation(ctx, node, (result) =>
    commitComputedValue(ctx, node, prevValue, result),
  );
}
