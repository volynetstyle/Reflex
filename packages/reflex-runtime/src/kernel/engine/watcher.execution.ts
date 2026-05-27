import type { ReactiveNode } from "../shape";
import { clearNodeComputing, markNodeComputing } from "../shape";
import { cleanupStaleSources } from "./tracking";
import {
  currentConsumer,
  advanceTrackingEpoch,
  defaultContext,
  graphReductionPolicy,
  setCurrentConsumer,
} from "../context";
import { observeGraphReductionRun } from "../reduction";
import {
  devAssertExecutableNode,
  devRecordComputeError,
  devRecordComputeFinish,
  devRecordComputeStart,
} from "../dev";

type NodeCompute = NonNullable<ReactiveNode["compute"]>;

export function executeKnownNodeComputation(
  node: ReactiveNode,
  compute: NodeCompute,
): unknown {
  const prevActive = currentConsumer;

  node.tailIn = null;
  markNodeComputing(node);
  advanceTrackingEpoch();
  setCurrentConsumer(node);

  devRecordComputeStart(node, defaultContext);

  let result: unknown;

  try {
    result = compute();
  } catch (error) {
    setCurrentConsumer(prevActive);
    clearNodeComputing(node);

    devRecordComputeError(node, error, defaultContext);

    throw error;
  }

  setCurrentConsumer(prevActive);
  clearNodeComputing(node);

  if (node.tailIn !== node.lastIn) {
    cleanupStaleSources(node);
  }

  const reductionPolicy = node.graphReductionPolicy ?? graphReductionPolicy;

  if (reductionPolicy.enabled) {
    observeGraphReductionRun(node, reductionPolicy);
  }

  devRecordComputeFinish(node, result, defaultContext);

  return result;
}

export function executeNodeComputation(node: ReactiveNode): unknown {
  devAssertExecutableNode(node);

  return executeKnownNodeComputation(node, node.compute as NodeCompute);
}
