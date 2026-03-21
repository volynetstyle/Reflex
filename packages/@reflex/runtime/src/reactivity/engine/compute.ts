import { DIRTY_STATE, ReactiveNode } from "../shape";
import { executeNodeComputation } from "./execute";

export function recompute(node: ReactiveNode): boolean {
  const prev = node.payload;

  return executeNodeComputation(node, (result) => {
    const changed = !Object.is(prev, result);
    node.payload = result;
    node.state &= ~DIRTY_STATE;
    return changed;
  });
}
