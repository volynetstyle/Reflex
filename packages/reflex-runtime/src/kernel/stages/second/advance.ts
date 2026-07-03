import { defaultContext } from "@runtime/kernel/config";
import {
  enterConsumerTracking,
  restoreConsumerTracking,
} from "@runtime/kernel/state";
import {
  devAssertExecutableNode,
  devAssertRefreshEdge,
  devRecordComputeError,
  devRecordComputeFinish,
  devRecordComputeStart,
  devRecordRecompute,
} from "@runtime/kernel/dev";
import {
  enterRuntimePhase,
  leaveRuntimePhase,
  RuntimePhase,
} from "@runtime/kernel/execution";
import {
  Computing,
  DIRTY_STATE,
  Visited,
  type ReactiveEdge,
  type ReactiveNode,
} from "@runtime/kernel/shape";
import { cleanupUnvisitedSources } from "@runtime/kernel/shape/tracking";
import {
  push_iterator_once,
  push_iterator_once_skipping,
} from "@runtime/kernel/stages/first";
import { profileRuntimeCounter } from "@runtime/profiling";
import { compare } from "@runtime/protocol";

/**
 * Advance to next value
 *
 * Recompute `node` and, if it changed, propagate dirtiness to its outgoing users.
 *
 * The active pull walker owns the current parent edge; this only propagates
 * side-fanout that existed before recompute.
 */

function advanceCore(
  node: ReactiveNode,
  skipOutEdge: ReactiveEdge | null = null,
): boolean {
  if (__PROFILE__) profileRuntimeCounter("advanceCalls");

  if (__DEV__) devAssertExecutableNode(node);

  const compute = node.compute as NonNullable<typeof node.compute>;
  node.tailIn = null;

  const computingState = (node.state & ~Visited) | Computing;
  node.state = computingState;

  const prevActive = enterConsumerTracking(node);

  if (__DEV__) devRecordComputeStart(node, defaultContext);

  let next: unknown;

  try {
    if (__PROFILE__) profileRuntimeCounter("advanceComputeRuns");

    next = compute();
  } catch (error) {
    restoreConsumerTracking(prevActive);
    node.state = computingState & ~Computing;

    if (__DEV__) devRecordComputeError(node, error, defaultContext);

    throw error;
  }

  restoreConsumerTracking(prevActive);

  const resolvedState = computingState & ~(Computing | DIRTY_STATE);

  if (__PROFILE__) profileRuntimeCounter("advanceCleanupChecks");

  if (node.tailIn !== node.lastIn) {
    node.state = computingState & ~Computing;
    if (__PROFILE__) profileRuntimeCounter("advanceCleanupRuns");
    cleanupUnvisitedSources(node);
  }

  if (__DEV__) devRecordComputeFinish(node, next, defaultContext);

  const prev = node.payload;
  node.payload = next;
  node.state = resolvedState;

  if (compare(prev, next)) {
    if (__PROFILE__) profileRuntimeCounter("advanceUnchanged");

    if (__DEV__) devRecordRecompute(node, false, next, prev, defaultContext);
    return false;
  }

  if (__PROFILE__) profileRuntimeCounter("advanceChanged");

  if (__DEV__) devRecordRecompute(node, true, next, prev, defaultContext);

  const firstOut = node.firstOut;

  if (firstOut !== null) {
    if (__PROFILE__) profileRuntimeCounter("advancePropagateCalls");

    if (__DEV__) devAssertRefreshEdge(node, firstOut);
    if (skipOutEdge !== null) {
      if (firstOut !== skipOutEdge || skipOutEdge.nextOut !== null) {
        if (__PROFILE__) profileRuntimeCounter("advancePropagateSkippedEdge");
        push_iterator_once_skipping(firstOut, skipOutEdge);
      }
    } else {
      push_iterator_once(firstOut);
    }
  }

  return true;
}

export const advance: (
  node: ReactiveNode,
  skipOutEdge?: ReactiveEdge | null,
) => boolean = __DEV__
  ? function advanceDev(node, skipOutEdge = null): boolean {
      enterRuntimePhase(RuntimePhase.Recomputing);

      try {
        return advanceCore(node, skipOutEdge);
      } finally {
        leaveRuntimePhase();
      }
    }
  : advanceCore;
