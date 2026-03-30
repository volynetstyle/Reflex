import { compare } from "../../api/compare";
import type { ReactiveNode } from "../shape";
import type { ExecutionContext } from "../context";
import {
  devAssertRecomputeAlive,
  devRecordRecompute,
} from "../dev";
import {
  beginNodeTracking,
  clearDirtyState,
  clearNodeTracking,
  isDisposedNode,
} from "../shape";
import { executeNodeComputation } from "./execute";
import { getDefaultContext } from "../context";

export function recompute(
  node: ReactiveNode,
  context: ExecutionContext = getDefaultContext(),
): boolean {
  if (isDisposedNode(node)) {
    devAssertRecomputeAlive();
    return false;
  }

  const prev = node.payload;
  let next: unknown = prev;
  let hasChanged = false;

  beginNodeTracking(node);

  try {
    hasChanged = executeNodeComputation(node, (result) => {
      if (isDisposedNode(node)) return false;

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

  devRecordRecompute(node, hasChanged, next, prev, context);

  return hasChanged;
}
