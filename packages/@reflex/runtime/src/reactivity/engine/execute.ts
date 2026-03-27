import runtime from "../context";
import type {
  ReactiveNode} from "../shape";
import {
  ReactiveNodeState,
  clearNodeComputing,
  markNodeComputing,
} from "../shape";
import { cleanupStaleSources } from "./tracking";

export function executeNodeComputation<T>(
  node: ReactiveNode,
  commit: (result: unknown) => T,
): T {
  if (__DEV__) {
    if (!node.compute) {
      throw new Error(
        "Cannot execute a reactive node without a compute function",
      );
    }
    if ((node.state & ReactiveNodeState.Computing) !== 0) {
      throw new Error("Cycle detected while recomputing reactive node");
    }
  }

  const compute = node.compute!;
  node.depsTail = null;
  node.state =
    (node.state & ~ReactiveNodeState.Visited) | ReactiveNodeState.Tracking;
  markNodeComputing(node);

  const prevActive = runtime.activeComputed;
  runtime.activeComputed = node;
  let result: unknown;

  try {
    try {
      result = compute();
    } finally {
      runtime.activeComputed = prevActive;
    }

    cleanupStaleSources(node);
    return commit(result);
  } finally {
    node.state &= ~ReactiveNodeState.Tracking;
    clearNodeComputing(node);
    runtime.maybeNotifySettled();
  }
}
