import { compare } from "../../api/compare";
import type { ReactiveNode } from "../shape";
import type { ExecutionContext } from "../context";
import {
  devAssertRecomputeAlive,
  devRecordRecompute,
} from "../dev";
import {
  clearDirtyState,
  isDisposedNode,
} from "../shape";
import { executeNodeComputationRaw } from "./execute";
import { getDefaultContext } from "../context";

export function recompute(
  node: ReactiveNode,
  context: ExecutionContext = getDefaultContext(),
): boolean {
  if (isDisposedNode(node)) {
    if (__DEV__) {
      devAssertRecomputeAlive();
    }
    return false;
  }

  const prev = node.payload;
  let next: unknown = prev;
  let hasChanged = false;
  next = executeNodeComputationRaw(node, context);
  if (!isDisposedNode(node)) {
    const changed = !compare(prev, next);
    hasChanged = changed;
    node.payload = next;
  }

  clearDirtyState(node);

  if (__DEV__) {
    devRecordRecompute(node, hasChanged, next, prev, context);
  }

  return hasChanged;
}
