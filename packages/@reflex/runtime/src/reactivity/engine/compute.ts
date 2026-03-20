import { ReactiveNode, clearDirtyState } from "../shape";
import { executeNodeComputation } from "./execute";

function commitComputedValue(
  node: ReactiveNode,
  prevValue: unknown,
  newValue: unknown,
): boolean {
  const changed = !Object.is(prevValue, newValue);

  node.payload = newValue;
  clearDirtyState(node);

  return changed;
}

export function recompute(node: ReactiveNode): boolean {
  if (!node.compute) return false;

  const prevValue = node.payload;
  return executeNodeComputation(node, (result) =>
    commitComputedValue(node, prevValue, result),
  );
}
