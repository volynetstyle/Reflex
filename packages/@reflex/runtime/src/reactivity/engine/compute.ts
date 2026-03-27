import { compare } from "../../api/compare";
import type { ReactiveNode } from "../shape";
import { DIRTY_STATE } from "../shape";
import { executeNodeComputation } from "./execute";

export function recompute(node: ReactiveNode): boolean {
  const prev = node.payload;

  return executeNodeComputation(node, (result) => {
    const changed = !compare(prev, result);
    node.payload = result;
    node.state &= ~DIRTY_STATE;
    return changed;
  });
}
