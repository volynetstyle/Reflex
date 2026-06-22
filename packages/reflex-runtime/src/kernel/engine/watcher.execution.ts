import type { ComputeFn, ReactiveNode } from "../shape";
import { Computing, Visited } from "../shape";
import { cleanupUnvisitedSources } from "./tracking";
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
import {
  enterRuntimePhase,
  leaveRuntimePhase,
  RuntimePhase,
} from "../execution";

export function executeKnownNodeComputation<T>(
  node: ReactiveNode<T>,
  compute: ComputeFn<T>,
): T {
  if (__DEV__) enterRuntimePhase(RuntimePhase.Recomputing);

  try {
    const prevActive = currentConsumer;

    node.tailIn = null;
    node.state = (node.state & ~Visited) | Computing | Computing;
    nextTrackingEpoch();
    setCurrentConsumer(node);

    if (__DEV__) devRecordComputeStart(node, defaultContext);

    let result: T;

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
  } finally {
    if (__DEV__) leaveRuntimePhase();
  }
}

export function executeNodeComputation<T>(node: ReactiveNode<T>): T {
  if (__DEV__) devAssertExecutableNode(node);

  return executeKnownNodeComputation(node, node.compute);
}
