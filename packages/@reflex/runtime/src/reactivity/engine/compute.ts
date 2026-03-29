import { compare } from "../../api/compare";
import { recordDebugEvent } from "../../debug";
import type { ReactiveNode } from "../shape";
import type { ExecutionContext } from "../context";
import {
  beginNodeTracking,
  clearDirtyState,
  clearNodeTracking,
} from "../shape";
import { executeNodeComputation } from "./execute";
import { getDefaultContext } from "../context";

export function recompute(
  node: ReactiveNode,
  context: ExecutionContext = getDefaultContext(),
): boolean {
  const prev = node.payload;
  let next: unknown = prev;
  let hasChanged = false;

  beginNodeTracking(node);

  try {
    hasChanged = executeNodeComputation(node, (result) => {
      next = result;
      const changed = !compare(prev, result);
      hasChanged = changed;
      node.payload = result;

      return changed;
    }, context);
  } finally {
    clearNodeTracking(node);
  }

  clearDirtyState(node);

  if (__DEV__) {
    recordDebugEvent(context, "recompute", {
      node,
      detail: {
        changed: hasChanged,
        next,
        previous: prev,
      },
    });
  }

  return hasChanged;
}
