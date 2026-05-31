import type { ReactiveNode } from "../shape";
import {
  devAssertExecutableNode,
  devRecordComputeError,
  devRecordComputeFinish,
  devRecordComputeStart,
  devRecordRecompute,
} from "../dev";
import {
  Computing,
  DIRTY_STATE,
  GraphReductionEnabled,
  Visited,
} from "../shape";
import {
  nextTrackingEpoch,
  currentConsumer,
  defaultContext,
  graphReductionPolicy,
  setCurrentConsumer,
} from "../context";
import { compare } from "../../protocol/utils/compare";
import { observeGraphReductionRun } from "../reduction";
import { cleanupStaleSources } from "./tracking";

export function recompute(node: ReactiveNode): boolean {
  if (__DEV__) devAssertExecutableNode(node);
  const compute = node.compute as NonNullable<typeof node.compute>;

  node.tailIn = null;
  node.state = (node.state & ~Visited) | Computing;
  nextTrackingEpoch();

  const prevActive = currentConsumer;
  setCurrentConsumer(node);

  if (__DEV__) devRecordComputeStart(node, defaultContext);

  let next: unknown;

  try {
    next = compute();
  } catch (error) {
    setCurrentConsumer(prevActive);
    node.state &= ~Computing;

    if (__DEV__) devRecordComputeError(node, error, defaultContext);
    throw error;
  }

  setCurrentConsumer(prevActive);
  node.state &= ~Computing;

  if (node.tailIn !== node.lastIn) {
    cleanupStaleSources(node);
  }

  const reductionEnabled =
    graphReductionPolicy.enabled || (node.state & GraphReductionEnabled) !== 0;

  if (reductionEnabled) {
    observeGraphReductionRun(node, graphReductionPolicy, reductionEnabled);
  }

  if (__DEV__) devRecordComputeFinish(node, next, defaultContext);

  const prev = node.payload;
  const hasChanged = !compare(prev, next);

  node.payload = next;
  node.state &= ~DIRTY_STATE;

  if (__DEV__) devRecordRecompute(node, hasChanged, next, prev, defaultContext);

  return hasChanged;
}
