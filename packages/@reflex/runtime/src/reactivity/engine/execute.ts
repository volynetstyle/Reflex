import type { ExecutionContext } from "../context";
import { recordDebugEvent } from "../../debug";
import type { ReactiveNode } from "../shape";
import {
  ReactiveNodeState,
  clearNodeComputing,
  isDisposedNode,
  markNodeComputing,
} from "../shape";
import { cleanupStaleSources } from "./tracking";
import { getDefaultContext } from "../context";

type CommitComputation<T> = (result: unknown) => T;

function prepareNodeExecution(node: ReactiveNode): () => void {
  const context = getDefaultContext();

  node.depsTail = null;
  node.state =
    (node.state & ~ReactiveNodeState.Visited) | ReactiveNodeState.Tracking;
  markNodeComputing(node);

  const prevActive = context.activeComputed;
  context.activeComputed = node;
  let restored = false;

  if (__DEV__) {
    recordDebugEvent(context, "compute:start", {
      node,
    });
  }

  return () => {
    if (restored) return;
    restored = true;
    context.activeComputed = prevActive;
  };
}

export function executeNodeComputationRaw(node: ReactiveNode): unknown {
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

  const context = getDefaultContext();
  const compute = node.compute!;
  const restoreActive = prepareNodeExecution(node);
  let result: unknown;

  try {
    result = compute();
    restoreActive();
    cleanupStaleSources(node);

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
    restoreActive();

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
  if (isDisposedNode(node)) return undefined as T;

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
  const restoreActive = prepareNodeExecution(node);
  let result: unknown;

  try {
    result = compute();
    restoreActive();
    cleanupStaleSources(node);
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
    restoreActive();

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
