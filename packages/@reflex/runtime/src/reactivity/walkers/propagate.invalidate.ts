// ─── propagate invalidation seam ────────────────────────────────────────────
//
// Keep state resolution and subscriber invalidation commit in one shared seam
// so both propagate loops reuse the same small call sites instead of carrying
// duplicate branch-heavy logic inline.

import { recordDebugEvent } from "../../debug/debug.impl";
import {
  captureThrownError,
  defaultContext,
  dispatchSinkInvalidated,
} from "../context";
import {
  DIRTY_STATE,
  Invalid,
  type ReactiveEdge,
  type ReactiveNode,
} from "../shape";
import {
  DISPOSED_MASK,
  IMMEDIATE,
  SLOW_PATH_INVALIDATION_MASK,
  TRACKING_MASK,
  VISITED_MASK,
} from "./propagate.constants";

export function dispatchInvalidatedWatcher(
  watcherNode: ReactiveNode,
): void {
  const notifyInvalidatedSink = dispatchSinkInvalidated;

  if (notifyInvalidatedSink === undefined) {
    if (__DEV__) {
      recordDebugEvent(defaultContext, "watcher:invalidated", {
        node: watcherNode,
      });
    }

    return;
  }

  try {
    notifyInvalidatedSink(watcherNode);
  } catch (error) {
    captureThrownError(error);
  }
}

function getTrackedSubscriberInvalidationState(
  inboundEdge: ReactiveEdge,
  subscriber: ReactiveNode,
  subscriberState: number,
): number {
  const trackedInputTail = subscriber.lastInTail;
  if (trackedInputTail === null) return 0;

  const trackedInvalidState =
    subscriberState |
    VISITED_MASK |
    Invalid;
  if (inboundEdge === trackedInputTail) return trackedInvalidState;

  const previousInboundEdge = inboundEdge.prevIn;
  if (previousInboundEdge === null) return trackedInvalidState;
  if (previousInboundEdge === trackedInputTail) return 0;

  let scannedInputEdge = previousInboundEdge.prevIn;
  while (
    scannedInputEdge !== null &&
    scannedInputEdge !== trackedInputTail
  ) {
    scannedInputEdge = scannedInputEdge.prevIn;
  }

  return scannedInputEdge === trackedInputTail
    ? 0
    : trackedInvalidState;
}

export function invalidateSubscriber(
  inboundEdge: ReactiveEdge,
  subscriber: ReactiveNode,
  subscriberState: number,
  promoteState: number,
): number {
  const clearedVisitedState =
    (subscriberState & ~VISITED_MASK) |
    promoteState;
  let nextSubscriberState = clearedVisitedState;

  if ((subscriberState & SLOW_PATH_INVALIDATION_MASK) !== 0) {
    if ((subscriberState & DISPOSED_MASK) !== 0) return 0;

    if ((subscriberState & TRACKING_MASK) !== 0) {
      nextSubscriberState = getTrackedSubscriberInvalidationState(
        inboundEdge,
        subscriber,
        subscriberState,
      );
      if (nextSubscriberState === 0) return 0;
    } else {
      if ((subscriberState & DIRTY_STATE) !== 0) return 0;
    }
  }

  subscriber.state = nextSubscriberState;

  if (__DEV__) {
    recordDebugEvent(defaultContext, "propagate", {
      detail: {
        immediate: promoteState === IMMEDIATE,
        nextState: nextSubscriberState,
      },
      source: inboundEdge.from,
      target: subscriber,
    });
  }

  return nextSubscriberState;
}
