import { defaultContext, emitSinkInvalidated } from "../context";
import { devRecordPropagate } from "../dev";
import {
  Changed,
  DIRTY_STATE,
  Invalid,
  Reentrant,
  Tracking,
  type ReactiveEdge,
  type ReactiveNode,
} from "../shape";

const INVALIDATE_SLOW_STATE = DIRTY_STATE | Tracking;

// @__INLINE__
export const notifyWatcher = emitSinkInvalidated;

// @__INLINE__
function invalidateTracked(
  edge: ReactiveEdge,
  sub: ReactiveNode,
  state: number,
): number {
  const tail = sub.tailIn;
  if (tail === null) return 0;

  if (edge !== tail) {
    for (let prev = edge.prevIn; prev !== null; prev = prev.prevIn) {
      if (prev === tail) return 0;
    }
  }

  return state | Reentrant | Invalid;
}

export function invalidateSub(
  edge: ReactiveEdge,
  sub: ReactiveNode,
  state: number,
  promote: number,
): number {
  if ((state & INVALIDATE_SLOW_STATE) === 0) {
    const next = (state & ~Reentrant) | promote;
    sub.state = next;

    devRecordPropagate(edge, next, promote === Changed, defaultContext);

    return next;
  }

  let next = (state & ~Reentrant) | promote;

  if ((state & (DIRTY_STATE | Tracking)) !== 0) {
    if ((state & Tracking) !== 0) {
      next = invalidateTracked(edge, sub, state);
      if (next === 0) return 0;
    } else if ((state & DIRTY_STATE) !== 0) {
      return 0;
    }
  }

  sub.state = next;

  devRecordPropagate(edge, next, promote === Changed, defaultContext);

  return next;
}
