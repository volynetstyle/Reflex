import { compare } from "../../api/compare";
import type { ReactiveNode } from "../shape";
import { devAssertRecomputeAlive, devRecordRecompute } from "../dev";
import { clearDirtyState, isDisposedNode } from "../shape";
import { executeNodeComputation } from "./execute";
import { defaultContext } from "../context";

export function recompute(node: ReactiveNode): boolean {
  if (isDisposedNode(node)) {
    if (__DEV__) {
      devAssertRecomputeAlive();
    }
    return false;
  }

  const prev = node.payload;
  let next: unknown = prev;
  let hasChanged = false;

  next = executeNodeComputation(node);

  if (!isDisposedNode(node)) {
    const changed = !compare(prev, next);
    hasChanged = changed;
    node.payload = next;
  }

  clearDirtyState(node);

  if (__DEV__) {
    devRecordRecompute(node, hasChanged, next, prev, defaultContext);
  }

  return hasChanged;
}
