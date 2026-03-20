import runtime from "../context";
import {
  ReactiveNode,
  ReactiveNodeState,
  clearNodeComputing,
  markNodeComputing,
} from "../shape";
import { cleanupStaleSources } from "./tracking";

export function invokeCompute(
  node: ReactiveNode,
  compute: NonNullable<ReactiveNode["compute"]>,
): unknown {
  const ctx = runtime;
  const prevActive = ctx.activeComputed;
  ctx.activeComputed = node;

  try {
    return compute();
  } finally {
    ctx.activeComputed = prevActive;
  }
}

export function executeNodeComputation<T>(
  node: ReactiveNode,
  commit: (result: unknown) => T,
): T {
  const compute = node.compute!;

  if (__DEV__) {
    if (!compute) {
      throw new Error(
        "Cannot execute a reactive node without a compute function",
      );
    }

    if ((node.state & ReactiveNodeState.Computing) !== 0) {
      throw new Error("Cycle detected while recomputing reactive node");
    }
  }

  node.depsTail = null;
  node.state &= ~ReactiveNodeState.Visited;
  node.state |= ReactiveNodeState.Tracking;
  markNodeComputing(node);

  try {
    const result = invokeCompute(node, compute);
    cleanupStaleSources(node);

    return commit(result);
  } finally {
    node.state &= ~ReactiveNodeState.Tracking;
    clearNodeComputing(node);
  }
}
