import { ReactiveNode, clearDirtyState, getNodeContext } from "../shape";
import { executeNodeComputation } from "./execute";

function commitComputedValue(
  node: ReactiveNode,
  prevValue: unknown,
  newValue: unknown,
): boolean {
  const changed = !Object.is(prevValue, newValue);
  const ctx = getNodeContext(node);

  node.payload = newValue;
  node.v = ctx.getEpoch();
  clearDirtyState(node);

  if (changed) {
    node.t = node.v;
  }

  return changed;
}

export function recompute(node: ReactiveNode): boolean {
  if (!node.compute) return false;

  const prevValue = node.payload;
  return executeNodeComputation(node, (result) =>
    commitComputedValue(node, prevValue, result),
  );
}
