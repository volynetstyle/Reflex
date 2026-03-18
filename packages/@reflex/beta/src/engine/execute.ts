import {
  EngineContext,
  ReactiveNode,
  clearNodeComputing,
  isComputingState,
  isTrackingState,
  markNodeComputing,
} from "../core.js";
import { cleanupStaleSources } from "../tracking.js";

function didTrackAllSources(node: ReactiveNode): boolean {
  const incoming = node.incoming;
  for (let i = 0; i < incoming.length; ++i) {
    if (incoming[i]!.s !== node.s) {
      return false;
    }
  }
  return true;
}

function invokeCompute(
  ctx: EngineContext,
  node: ReactiveNode,
  compute: () => unknown,
): unknown {
  const prevActive = ctx.activeComputed;
  ctx.activeComputed = node;
  try {
    return compute();
  } finally {
    ctx.activeComputed = prevActive;
  }
}

export function executeNodeComputation<T>(
  ctx: EngineContext,
  node: ReactiveNode,
  commit: (result: unknown) => T,
): T {
  const compute = node.compute;
  if (__DEV__ && !compute) {
    throw new Error("Cannot execute a reactive node without a compute function");
  }
  if (__DEV__ && isComputingState(node.state)) {
    throw new Error("Cycle detected while recomputing reactive node");
  }

  const stable = isTrackingState(node.state);
  ++node.s;
  markNodeComputing(node);

  try {
    const result = invokeCompute(ctx, node, compute!);

    if (!stable || !isTrackingState(node.state) || !didTrackAllSources(node)) {
      cleanupStaleSources(node);
    }

    return commit(result);
  } finally {
    clearNodeComputing(node);
  }
}
