import type { ReactiveNode } from "../shape";
import { clearNodeComputing, markNodeComputing, Producer } from "../shape";
import { cleanupStaleSources } from "./trackingContext";
import {
  activeConsumer,
  advanceTrackingVersion,
  defaultContext,
  graphReduction,
  setActiveConsumer,
} from "../context";
import { observeGraphReductionRun } from "../reduction";
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
  setActiveConsumer((node.state & Producer) !== 0 ? null : prevActive);
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
  if (graphReduction.enabled) observeGraphReductionRun(node, graphReduction);

  devRecordComputeFinish(node, result, defaultContext);

  return result;
}
