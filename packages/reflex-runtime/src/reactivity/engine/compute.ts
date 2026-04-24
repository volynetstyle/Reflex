import type { ReactiveNode } from "../shape";
import { devAssertRecomputeAlive, devRecordRecompute } from "../dev";
import { clearDirtyState, Disposed } from "../shape";
import { executeNodeComputation } from "./execute";
import { defaultContext } from "../context";
import { compare } from "../../protocol/utils/compare";

export function recompute(node: ReactiveNode): boolean {
  if ((node.state & Disposed) !== 0) {
    if (__DEV__) {
      devAssertRecomputeAlive();
    }
    return false;
  }

  const prev = node.payload;
  const next = executeNodeComputation(node);

  if ((node.state & Disposed) === 0) {
    const hasChanged = !compare(prev, next);
    node.payload = next;
    clearDirtyState(node);

    if (__DEV__) {
      devRecordRecompute(node, hasChanged, next, prev, defaultContext);
    }

    return hasChanged;
  }

  clearDirtyState(node);

  if (__DEV__) {
    devRecordRecompute(node, false, next, prev, defaultContext);
  }

  return false;
}
