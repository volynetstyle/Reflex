// ─── propagate invalidation seam ────────────────────────────────────────────
//
// Keep state resolution and subscriber invalidation commit in one shared seam
// so both propagate loops reuse the same small call sites instead of carrying
// duplicate branch-heavy logic inline.

import { recordDebugEvent } from "../../debug.runtime";
import { defaultContext, dispatchEffectInvalidated } from "../context";
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
  WATCHER_MASK,
} from "./propagate.constants";

export function dispatchInvalidatedWatcher(
  sub: ReactiveNode,
  dispatch: typeof dispatchEffectInvalidated,
  thrown: unknown,
): unknown {
  if (dispatch !== undefined) {
    try {
      dispatch(sub);
    } catch (error) {
      if (thrown === null) {
        return error;
      }
    }
  } else if (__DEV__) {
    recordDebugEvent(defaultContext, "watcher:invalidated", { node: sub });
  }

  return thrown;
}

function getTrackingInvalidatedSubscriberState(
  edge: ReactiveEdge,
  sub: ReactiveNode,
  subState: number,
): number {
  const depsTail = sub.depsTail;
  if (depsTail === null) return 0;

  const invalidatedState = subState | VISITED_MASK | ReactiveNodeState.Invalid;
  if (edge === depsTail) return invalidatedState;

  const prevIn = edge.prevIn;
  if (prevIn === null) return invalidatedState;
  if (prevIn === depsTail) return 0;

  let cursor = prevIn.prevIn;
  while (cursor !== null && cursor !== depsTail) {
    cursor = cursor.prevIn;
  }

  return cursor === depsTail ? 0 : invalidatedState;
}

export function getInvalidatedSubscriberState(
  edge: ReactiveEdge,
  sub: ReactiveNode,
  subState: number,
  promoteBit: number,
): number {
  const promotedState = (subState & ~VISITED_MASK) | promoteBit;

  if ((subState & SLOW_INVALIDATION_MASK) === 0) return promotedState;
  if ((subState & DISPOSED_MASK) !== 0) return 0;

  if ((subState & TRACKING_MASK) === 0) {
    return (subState & DIRTY_STATE) !== 0 ? 0 : promotedState;
  }

  return getTrackingInvalidatedSubscriberState(edge, sub, subState);
}

export function commitInvalidatedSubscriberState(
  edge: ReactiveEdge,
  sub: ReactiveNode,
  nextState: number,
  promoteBit: number,
): ReactiveEdge | null {
  sub.state = nextState;

  if (__DEV__) {
    recordDebugEvent(defaultContext, "propagate", {
      detail: { immediate: promoteBit === IMMEDIATE, nextState },
      source: edge.from,
      target: sub,
    });
  }

  return (nextState & WATCHER_MASK) === 0 ? sub.firstOut : null;
}

export function isWatcherInvalidatedState(nextState: number): boolean {
  return (nextState & WATCHER_MASK) !== 0;
}
