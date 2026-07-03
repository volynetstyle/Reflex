import { defaultContext } from "@runtime/kernel/config";
import {
  advanceTrackingEpoch,
  currentConsumer,
  setCurrentConsumer,
} from "@runtime/kernel/state";
import {
  devAssertExecutableNode,
  devRecordComputeError,
  devRecordComputeFinish,
  devRecordComputeStart,
} from "@runtime/kernel/dev";
import {
  enterRuntimePhase,
  leaveRuntimePhase,
  RuntimePhase,
} from "@runtime/kernel/execution";
import {
  Computing,
  Visited,
  type ComputeFn,
  type ReactiveNode,
} from "@runtime/kernel/shape";
import { cleanupUnvisitedSources } from "@runtime/kernel/shape/tracking";

export function executeKnownNodeComputation<T>(
  node: ReactiveNode<T>,
  compute: ComputeFn<T>,
): T {
  if (!__DEV__) return executeComputation(node, compute);

  enterRuntimePhase(RuntimePhase.Recomputing);
  try {
    return executeComputation(node, compute);
  } finally {
    leaveRuntimePhase();
  }
}

function executeComputation<T>(
  node: ReactiveNode<T>,
  compute: ComputeFn<T>,
): T {
  const prevActive = currentConsumer;

  node.tailIn = null;
  node.state = (node.state & ~Visited) | Computing | Computing;
  advanceTrackingEpoch();
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
}

export function executeNodeComputation<T>(node: ReactiveNode<T>): T {
  if (__DEV__) devAssertExecutableNode(node);

  return executeKnownNodeComputation(node, node.compute);
}
