import { compare } from "../../api/compare";
import { recordDebugEvent } from "../../debug";
import type { ReactiveNode } from "../shape";
import type { ExecutionContext } from "../context";
import { DIRTY_STATE } from "../shape";
import { executeNodeComputation } from "./execute";
import { getDefaultContext } from "../context";

export function recompute(
  node: ReactiveNode,
  context: ExecutionContext = getDefaultContext(),
): boolean {
  const prev = node.payload;

  return executeNodeComputation(node, (result) => {
    const changed = !compare(prev, result);
    node.payload = result;
    node.state &= ~DIRTY_STATE;

    if (__DEV__) {
      recordDebugEvent(context, "recompute", {
        node,
        detail: {
          changed,
          next: result,
          previous: prev,
        },
      });
    }

    return changed;
  }, context);
}
