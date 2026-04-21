import type { ReactiveNode } from "../shape";
import {
  Computing,
  clearNodeComputing,
  markNodeComputing,
} from "../shape";
import { cleanupStaleSources } from "./tracking";
import {
  activeConsumer,
  advanceTrackingVersion,
  defaultContext,
  setActiveConsumer,
} from "../context";
import { recordDebugEvent } from "../../debug/debug.impl";

function prepareNodeExecution(node: ReactiveNode): ReactiveNode | null {
  node.lastInTail = null;
  markNodeComputing(node);
  advanceTrackingVersion();

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
  clearNodeComputing(node);
}

export function executeNodeComputation(node: ReactiveNode): unknown {
  if (__DEV__) {
    if (!node.compute) {
      throw new Error(
        "Cannot execute a reactive node without a compute function",
      );
    }
    if ((node.state & Computing) !== 0) {
      throw new Error("Cycle detected while recomputing reactive node");
    }
  }

  const prevActive = prepareNodeExecution(node);

  let result: unknown;
  try {
    result = (node.compute as NonNullable<typeof node.compute>)();
  } catch (error) {
    restoreNodeExecution(node, prevActive);

    if (__DEV__) {
      recordDebugEvent(defaultContext, "compute:error", {
        node,
        detail: { error },
      });
    }

    throw error;
  }

  restoreNodeExecution(node, prevActive);
  if (node.lastInTail !== node.lastIn) cleanupStaleSources(node);

  if (__DEV__) {
    recordDebugEvent(defaultContext, "compute:finish", {
      node,
      detail: { result },
    });
  }

  return result;
}
