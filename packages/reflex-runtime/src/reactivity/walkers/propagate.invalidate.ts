import { recordDebugEvent } from "../../debug/debug.runtime";
import { defaultContext, dispatchSinkInvalidated } from "../context";
import {
  Changed,
  DIRTY_STATE,
  Invalid,
  Reentrant,
  Tracking,
  type ReactiveEdge,
  type ReactiveNode,
} from "../shape";

export function notifyWatcher(node: ReactiveNode): void {
  const notify = dispatchSinkInvalidated;

  if (notify === undefined) {
    if (__DEV__) {
      recordDebugEvent(defaultContext, "watcher:invalidated", { node });
    }
    return;
  }

  notify(node);
}

function invalidateTracked(
  edge: ReactiveEdge,
  sub: ReactiveNode,
  state: number,
): number {
  const tail = sub.lastInTail;
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

  if (__DEV__) {
    recordDebugEvent(defaultContext, "propagate", {
      detail: {
        immediate: promote === Changed,
        nextState: next,
      },
      source: edge.from,
      target: sub,
    });
  }

  return next;
}
