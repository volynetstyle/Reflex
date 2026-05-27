import type { ReactiveNode } from "../shape";
import {
  devAssertExecutableNode,
  devRecordComputeError,
  devRecordComputeFinish,
  devRecordComputeStart,
  devRecordRecompute,
} from "../dev";
import { Computing, DIRTY_STATE, Reentrant, Tracking } from "../shape";
import {
  advanceTrackingEpoch,
  currentConsumer,
  defaultContext,
  graphReductionPolicy,
  setCurrentConsumer,
} from "../context";
import { compare } from "../../protocol/utils/compare";
import { observeGraphReductionRun } from "../reduction";
import { cleanupStaleSources } from "./tracking";

export function recompute(node: ReactiveNode): boolean {
  devAssertExecutableNode(node);
  const compute = node.compute as NonNullable<typeof node.compute>;

  node.tailIn = null;
  node.state = (node.state & ~Reentrant) | Tracking | Computing;
  advanceTrackingEpoch();

  const prevActive = currentConsumer;
  setCurrentConsumer(node);

  devRecordComputeStart(node, defaultContext);

  let next: unknown;

  try {
    next = compute();
  } catch (error) {
    setCurrentConsumer(prevActive);
    node.state &= ~(Computing | Tracking);

    devRecordComputeError(node, error, defaultContext);
    throw error;
  }

  setCurrentConsumer(prevActive);
  node.state &= ~(Computing | Tracking);

  if (node.tailIn !== node.lastIn) {
    cleanupStaleSources(node);
  }

  const reductionPolicy = node.graphReductionPolicy ?? graphReductionPolicy;

  if (reductionPolicy.enabled) {
    observeGraphReductionRun(node, reductionPolicy);
  }

  devRecordComputeFinish(node, next, defaultContext);

  const prev = node.payload;
  const hasChanged = !compare(prev, next);

  node.payload = next;
  node.state &= ~DIRTY_STATE;

  devRecordRecompute(node, hasChanged, next, prev, defaultContext);

  return hasChanged;
}
