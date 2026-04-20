import type { ReactiveNode } from "../shape";
import {
  ReactiveNodeState,
  clearNodeComputing,
  markNodeComputing,
} from "../shape";
import { cleanupStaleSources } from "./tracking";
import {
  activeConsumer,
  defaultContext,
  setActiveConsumer,
  setTrackingVersion,
  trackingVersion,
} from "../context";
import { recordDebugEvent } from "../../debug/debug.impl";

function prepareNodeExecution(node: ReactiveNode): ReactiveNode | null {
  const nextVersion = (trackingVersion + 1) >>> 0;

  node.lastInTail = null;
  node.state =
    (node.state & ~ReactiveNodeState.Reentrant) | ReactiveNodeState.Tracking;
  markNodeComputing(node);
  setTrackingVersion(nextVersion === 0 ? 1 : nextVersion);

  const prevActive = activeConsumer;
  setActiveConsumer(node);

  if (__DEV__) {
    recordDebugEvent(defaultContext, "compute:start", {
      node,
    });
  }

  return prevActive;
}

function restoreNodeExecution(
  node: ReactiveNode,
  prevActive: ReactiveNode | null,
): void {
  setActiveConsumer(prevActive);
  node.state &= ~ReactiveNodeState.Tracking;
  clearNodeComputing(node);
}

export function executeNodeComputation(node: ReactiveNode): unknown {
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
  const prevActive = prepareNodeExecution(node);
  let result: unknown;

  try {
    result = compute();
    restoreNodeExecution(node, prevActive);

    if (node.lastInTail !== node.lastIn) {
      cleanupStaleSources(node);
    }

    if (__DEV__) {
      recordDebugEvent(defaultContext, "compute:finish", {
        node,
        detail: {
          result,
        },
      });
    }

    return result;
  } catch (error) {
    restoreNodeExecution(node, prevActive);

    if (__DEV__) {
      recordDebugEvent(defaultContext, "compute:error", {
        node,
        detail: {
          error,
        },
      });
    }

    throw error;
  }
}
