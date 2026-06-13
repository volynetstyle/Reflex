import type { ComputeFn, ReactiveNode } from "../shape";
import {
  Computing,
  Visited,
} from "../shape";
import { cleanupUnvisitedSources } from "../shape/tracking";
import {
  currentConsumer,
  nextTrackingEpoch,
  defaultContext,
  setCurrentConsumer,
} from "../context";
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
  node.state = (node.state & ~Visited) | Computing | Computing;
  nextTrackingEpoch();
  setCurrentConsumer(node);

  if (__DEV__) devRecordComputeStart(node, defaultContext);

  let result: unknown;

  try {
    result = compute!();
  } catch (error) {
    setCurrentConsumer(prevActive);
    node.state &= ~(Computing | Computing);

    if (__DEV__) devRecordComputeError(node, error, defaultContext);

    throw error;
  }

  setCurrentConsumer(prevActive);
  node.state &= ~(Computing | Computing);

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
