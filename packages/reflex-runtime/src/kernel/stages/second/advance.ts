import { compare } from "../../../protocol";
import {
  devAssertExecutableNode,
  devAssertRefreshEdge,
  devRecordComputeError,
  devRecordComputeFinish,
  devRecordComputeStart,
  devRecordRecompute,
} from "../../dev";
import { cleanupStaleSources } from "../../engine";
import {
  nextTrackingEpoch,
  currentConsumer,
  setCurrentConsumer,
  defaultContext,
} from "../../execution";
import {
  Computing,
  DIRTY_STATE,
  Visited,
  type ReactiveNode,
} from "../../shape";
import { push_iterator_once } from "../first/push_iterator_once";

/**
 * Advance to next value
 *
 * Recompute `node` and, if it changed, propagate dirtiness to its outgoing users.
 *
 * The active pull walker owns the current parent edge; this only propagates
 * side-fanout that existed before recompute.
 */

export function advance(node: ReactiveNode): boolean {
  if (__DEV__) devAssertExecutableNode(node);

  const compute = node.compute as NonNullable<typeof node.compute>;
  const firstOut = node.firstOut;

  node.tailIn = null;

  const computingState = (node.state & ~Visited) | Computing;
  node.state = computingState;

  nextTrackingEpoch();

  const prevActive = currentConsumer;
  setCurrentConsumer(node);

  if (__DEV__) devRecordComputeStart(node, defaultContext);

  let next: unknown;

  try {
    next = compute();
  } catch (error) {
    setCurrentConsumer(prevActive);
    node.state = computingState & ~Computing;

    if (__DEV__) devRecordComputeError(node, error, defaultContext);

    throw error;
  }

  setCurrentConsumer(prevActive);

  const resolvedState = computingState & ~(Computing | DIRTY_STATE);

  if (node.tailIn !== node.lastIn) {
    node.state = computingState & ~Computing;
    cleanupStaleSources(node);
  }

  if (__DEV__) devRecordComputeFinish(node, next, defaultContext);

  const prev = node.payload;
  node.payload = next;
  node.state = resolvedState;

  if (compare(prev, next)) {
    if (__DEV__) devRecordRecompute(node, false, next, prev, defaultContext);
    return false;
  }

  if (__DEV__) devRecordRecompute(node, true, next, prev, defaultContext);

  if (firstOut !== null) {
    if (__DEV__) devAssertRefreshEdge(node, firstOut);
    push_iterator_once(firstOut);
  }

  return true;
}
