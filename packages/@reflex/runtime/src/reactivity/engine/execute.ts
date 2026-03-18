import {
  ReactiveNode,
  clearNodeComputing,
  getNodeContext,
  isComputingState,
  markNodeComputing,
} from "../shape";
import { cleanupStaleSources } from "../tracking";

function invokeCompute(node: ReactiveNode, compute: () => unknown): unknown {
  const ctx = getNodeContext(node);
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
  const compute = node.compute;

  if (!compute) {
    throw new Error(
      "Cannot execute a reactive node without a compute function",
    );
  }

  if (isComputingState(node.state)) {
    throw new Error("Cycle detected while recomputing reactive node");
  }

  ++node.s;
  markNodeComputing(node);

  try {
    const result = invokeCompute(node, compute!);
    cleanupStaleSources(node);

    return commit(result);
  } finally {
    clearNodeComputing(node);
  }
}
