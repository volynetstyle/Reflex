// ─── propagate invalidation seam ────────────────────────────────────────────
//
// Keep state resolution and subscriber invalidation commit in one shared seam
// so both propagate loops reuse the same small call sites instead of carrying
// duplicate branch-heavy logic inline.

import { recordDebugEvent } from "../../debug/debug.impl";
import { dispatchSinkInvalidated } from "../context";
import { defaultContext } from "../context";
import {
  DIRTY_STATE,
  type ReactiveEdge,
  type ReactiveNode,
  ReactiveNodeState,
} from "../shape";
import {
  DISPOSED_MASK,
  IMMEDIATE,
  SLOW_INVALIDATION_MASK,
  TRACKING_MASK,
  VISITED_MASK,
} from "./propagate.constants";

export function dispatchInvalidatedWatcher(
  sub: ReactiveNode,
  thrown: unknown,
): unknown {
  const dispatch = dispatchSinkInvalidated;

  if (dispatch === undefined) {
    if (__DEV__) {
      recordDebugEvent(defaultContext, "watcher:invalidated", { node: sub });
    }

    return thrown;
  }

  try {
    dispatch(sub);
  } catch (error) {
    if (thrown === null) {
      return error;
    }
  }

  return thrown;
}

function getTrackingInvalidatedSubscriberState(
  edge: ReactiveEdge,
  sub: ReactiveNode,
  subState: number,
): number {
  const lastOutTail = sub.lastOutTail;
  if (lastOutTail === null) return 0;

  const invalidatedState = subState | VISITED_MASK | ReactiveNodeState.Invalid;
  if (edge === lastOutTail) return invalidatedState;

  const prevIn = edge.prevIn;
  if (prevIn === null) return invalidatedState;
  if (prevIn === lastOutTail) return 0;

  let cursor = prevIn.prevIn;
  while (cursor !== null && cursor !== lastOutTail) {
    cursor = cursor.prevIn;
  }

  return cursor === lastOutTail ? 0 : invalidatedState;
}

export function invalidateSubscriber(
  edge: ReactiveEdge,
  sub: ReactiveNode,
  subState: number,
  promoteBit: number,
): number {
  const promotedState = (subState & ~VISITED_MASK) | promoteBit;
  let nextState = promotedState;

  if ((subState & SLOW_INVALIDATION_MASK) !== 0) {
    if ((subState & DISPOSED_MASK) !== 0) return 0;

    if ((subState & TRACKING_MASK) !== 0) {
      nextState = getTrackingInvalidatedSubscriberState(edge, sub, subState);
      if (nextState === 0) return 0;
    } else {
      if ((subState & DIRTY_STATE) !== 0) return 0;
    }
  }

  sub.state = nextState;

  if (__DEV__) {
    recordDebugEvent(defaultContext, "propagate", {
      detail: { immediate: promoteBit === IMMEDIATE, nextState },
      source: edge.from,
      target: sub,
    });
  }

  return nextState;
}
