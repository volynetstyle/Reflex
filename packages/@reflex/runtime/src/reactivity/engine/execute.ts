import type { ExecutionContext } from "../context";
import { recordDebugEvent } from "../../debug";
import type {
  ReactiveNode} from "../shape";
import {
  ReactiveNodeState,
  clearNodeComputing,
  markNodeComputing,
} from "../shape";
import { cleanupStaleSources } from "./tracking";
import { getDefaultContext } from "../context";

type CommitComputation<T> = (result: unknown) => T;

export function executeNodeComputationRaw(
  node: ReactiveNode,
  context: ExecutionContext = getDefaultContext(),
): unknown {
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

  const prevActive = context.activeComputed;
  context.activeComputed = node;
  let result: unknown;

  if (__DEV__) {
    recordDebugEvent(context, "compute:start", {
      node,
    });
  }

  try {
    try {
      result = compute();
    } finally {
      context.activeComputed = prevActive;
    }

    cleanupStaleSources(node, context);

    if (__DEV__) {
      recordDebugEvent(context, "compute:finish", {
        node,
        detail: {
          result,
        },
      });
    }

    return result;
  } catch (error) {
    if (__DEV__) {
      recordDebugEvent(context, "compute:error", {
        node,
        detail: {
          error,
        },
      });
    }

    throw error;
  } finally {
    node.state &= ~ReactiveNodeState.Tracking;
    clearNodeComputing(node);
    context.maybeNotifySettled();
  }
}

export function executeNodeComputation<T>(
  node: ReactiveNode,
  commit: CommitComputation<T>,
  context: ExecutionContext = getDefaultContext(),
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

  const prevActive = context.activeComputed;
  context.activeComputed = node;
  let result: unknown;

  if (__DEV__) {
    recordDebugEvent(context, "compute:start", {
      node,
    });
  }

  try {
    try {
      result = compute();
    } finally {
      context.activeComputed = prevActive;
    }

    cleanupStaleSources(node, context);
    const committed = commit(result);

    if (__DEV__) {
      recordDebugEvent(context, "compute:finish", {
        node,
        detail: {
          result,
        },
      });
    }

    return committed;
  } catch (error) {
    if (__DEV__) {
      recordDebugEvent(context, "compute:error", {
        node,
        detail: {
          error,
        },
      });
    }

    throw error;
  } finally {
    node.state &= ~ReactiveNodeState.Tracking;
    clearNodeComputing(node);
    context.maybeNotifySettled();
  }
}
