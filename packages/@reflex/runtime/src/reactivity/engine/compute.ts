import { DIRTY_STATE, ReactiveNode, clearDirtyState } from "../shape";
import { executeNodeComputation } from "./execute";

function commitComputedValue(
  node: ReactiveNode,
  prevValue: unknown,
  newValue: unknown,
): boolean {
  const changed = !Object.is(prevValue, newValue);

  node.payload = newValue;
  node.state &= ~DIRTY_STATE;

  return changed;
}

export function recompute(node: ReactiveNode): boolean {
  const commit = (result: unknown) =>
    commitComputedValue(node, node.payload, result);

  return executeNodeComputation(node, commit);
}
