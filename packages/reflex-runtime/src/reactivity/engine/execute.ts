import type { ReactiveNode } from "../shape";
import { clearNodeComputing, markNodeComputing } from "../shape";
import { cleanupStaleSources } from "./tracking";
import {
  activeConsumer,
  advanceTrackingVersion,
  defaultContext,
  setActiveConsumer,
} from "../context";
import {
  devAssertExecutableNode,
  devRecordComputeError,
  devRecordComputeFinish,
  devRecordComputeStart,
} from "../dev";

function prepareNodeExecution(node: ReactiveNode): ReactiveNode | null {
  node.lastInTail = null;
  markNodeComputing(node);
  advanceTrackingVersion();

  const prevActive = activeConsumer;
  setActiveConsumer(node);

  devRecordComputeStart(node, defaultContext);

  return prevActive;
}

function restoreNodeExecution(
  node: ReactiveNode,
  prevActive: ReactiveNode | null,
): void {
  setActiveConsumer(prevActive?.compute === null ? null : prevActive);
  clearNodeComputing(node);
}

/**
 * This piece of code has error boundary
 * @param node
 * @returns
 */
export function executeNodeComputation(node: ReactiveNode): unknown {
  devAssertExecutableNode(node);

  const prevActive = prepareNodeExecution(node);

  let result: unknown;
  try {
    result = (node.compute as NonNullable<typeof node.compute>)();
  } catch (error) {
    restoreNodeExecution(node, prevActive);
    devRecordComputeError(node, error, defaultContext);

    throw error;
  }

  restoreNodeExecution(node, prevActive);
  if (node.lastInTail !== node.lastIn) cleanupStaleSources(node);

  devRecordComputeFinish(node, result, defaultContext);

  return result;
}
