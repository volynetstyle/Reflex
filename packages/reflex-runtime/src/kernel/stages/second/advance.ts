import { compare } from "../../../protocol";
import {
  runtimeProfileCounters,
  runtimeProfileCountersEnabled,
} from "../../../profiling";
import {
  devAssertExecutableNode,
  devAssertRefreshEdge,
  devRecordComputeError,
  devRecordComputeFinish,
  devRecordComputeStart,
  devRecordRecompute,
} from "../../dev";
import { cleanupUnvisitedSources } from "../../engine";
import {
  beginConsumerTracking,
  restoreConsumer,
  defaultContext,
} from "../../context";
import {
  Computing,
  DIRTY_STATE,
  Visited,
  type ReactiveEdge,
  type ReactiveNode,
} from "../../shape";
import {
  push_iterator_once,
  push_iterator_once_skipping,
} from "../first";

/**
 * Advance to next value
 *
 * Recompute `node` and, if it changed, propagate dirtiness to its outgoing users.
 *
 * The active pull walker owns the current parent edge; this only propagates
 * side-fanout that existed before recompute.
 */

export function advance(
  node: ReactiveNode,
  skipOutEdge: ReactiveEdge | null = null,
): boolean {
  if (__PROFILE__ && runtimeProfileCountersEnabled) {
    runtimeProfileCounters.advanceCalls += 1;
  }

  if (__DEV__) devAssertExecutableNode(node);

  const compute = node.compute as NonNullable<typeof node.compute>;
  node.tailIn = null;

  const computingState = (node.state & ~Visited) | Computing;
  node.state = computingState;

  const prevActive = beginConsumerTracking(node);

  if (__DEV__) devRecordComputeStart(node, defaultContext);

  let next: unknown;

  try {
    if (__PROFILE__ && runtimeProfileCountersEnabled) {
      runtimeProfileCounters.advanceComputeRuns += 1;
    }

    next = compute();
  } catch (error) {
    restoreConsumer(prevActive);
    node.state = computingState & ~Computing;

    if (__DEV__) devRecordComputeError(node, error, defaultContext);

    throw error;
  }

  restoreConsumer(prevActive);

  const resolvedState = computingState & ~(Computing | DIRTY_STATE);

  if (__PROFILE__ && runtimeProfileCountersEnabled) {
    runtimeProfileCounters.advanceCleanupChecks += 1;
  }

  if (node.tailIn !== node.lastIn) {
    node.state = computingState & ~Computing;
    if (__PROFILE__ && runtimeProfileCountersEnabled) {
      runtimeProfileCounters.advanceCleanupRuns += 1;
    }
    cleanupUnvisitedSources(node);
  }

  if (__DEV__) devRecordComputeFinish(node, next, defaultContext);

  const prev = node.payload;
  node.payload = next;
  node.state = resolvedState;

  if (compare(prev, next)) {
    if (__PROFILE__ && runtimeProfileCountersEnabled) {
      runtimeProfileCounters.advanceUnchanged += 1;
    }

    if (__DEV__) devRecordRecompute(node, false, next, prev, defaultContext);
    return false;
  }

  if (__PROFILE__ && runtimeProfileCountersEnabled) {
    runtimeProfileCounters.advanceChanged += 1;
  }

  if (__DEV__) devRecordRecompute(node, true, next, prev, defaultContext);

  const firstOut = node.firstOut;

  if (firstOut !== null) {
    if (__PROFILE__ && runtimeProfileCountersEnabled) {
      runtimeProfileCounters.advancePropagateCalls += 1;
    }

    if (__DEV__) devAssertRefreshEdge(node, firstOut);
    if (skipOutEdge !== null) {
      if (firstOut !== skipOutEdge || skipOutEdge.nextOut !== null) {
        if (__PROFILE__ && runtimeProfileCountersEnabled) {
          runtimeProfileCounters.advancePropagateSkippedEdge += 1;
        }
        push_iterator_once_skipping(firstOut, skipOutEdge);
      }
    } else {
      push_iterator_once(firstOut);
    }
  }

  return true;
}
