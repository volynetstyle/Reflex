import type { ComputeFn, ReactiveNode } from "../shape";
import {
  clearNodeComputing,
  //GraphReductionEnabled,
  markNodeComputing,
} from "../shape";
import { cleanupUnvisitedSources } from "./tracking";
import {
  currentConsumer,
  nextTrackingEpoch,
  defaultContext,
  //graphReductionPolicy,
  setCurrentConsumer,
} from "../context";
//import { observeGraphReductionRun } from "../reduction";
import {
  devAssertExecutableNode,
  devRecordComputeError,
  devRecordComputeFinish,
  devRecordComputeStart,
} from "../dev";

export function executeKnownNodeComputation(
  node: ReactiveNode,
  compute: ComputeFn<unknown>,
): unknown {
  const prevActive = currentConsumer;

  node.tailIn = null;
  markNodeComputing(node);
  nextTrackingEpoch();
  setCurrentConsumer(node);

  if (__DEV__) devRecordComputeStart(node, defaultContext);

  let result: unknown;

  try {
    result = compute!();
  } catch (error) {
    setCurrentConsumer(prevActive);
    clearNodeComputing(node);

    if (__DEV__) devRecordComputeError(node, error, defaultContext);

    throw error;
  }

  setCurrentConsumer(prevActive);
  clearNodeComputing(node);

  if (node.tailIn !== node.lastIn) {
    cleanupUnvisitedSources(node);
  }

  // const reductionEnabled =
  //   graphReductionPolicy.enabled || (node.state & GraphReductionEnabled) !== 0;

  // if (reductionEnabled) {
  //   observeGraphReductionRun(node, graphReductionPolicy, reductionEnabled);
  // }

  if (__DEV__) devRecordComputeFinish(node, result, defaultContext);

  return result;
}

export function executeNodeComputation(node: ReactiveNode): unknown {
  if (__DEV__) devAssertExecutableNode(node);

  return executeKnownNodeComputation(node, node.compute);
}
