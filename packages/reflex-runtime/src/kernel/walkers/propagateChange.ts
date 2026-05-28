import { defaultContext } from "../context";
import { devRecordPropagate } from "../dev";
import {
  Changed,
  DIRTY_STATE,
  Invalid,
  Reentrant,
  Tracking,
  Watcher,
  type ReactiveEdge,
  type ReactiveNode,
} from "../shape";
import { notifyWatcher, invalidateSub } from "./invalidateBranch";
import {
  getPropagateStackBase,
  pushPropagateStack,
  readPropagateStack,
  readPropagateStackStats as readPropagateStackStatsFromStorage,
  restorePropagateStackBase,
  setPropagateStackHigh,
} from "./propagationStack";

const PROPAGATE_SLOW_STATE = DIRTY_STATE | Tracking;

// @__INLINE__
function markChanged(edge: ReactiveEdge, sub: ReactiveNode): number {
  const state = sub.state;

  if ((state & PROPAGATE_SLOW_STATE) === 0) {
    const next = (state & ~Reentrant) | Changed;
    sub.state = next;

    if (__DEV__) {
      devRecordPropagate(edge, next, true, defaultContext);
    }

    return next;
  }

  return invalidateSub(edge, sub, state, Changed);
}

// @__INLINE__
function markInvalid(edge: ReactiveEdge, sub: ReactiveNode): number {
  const state = sub.state;

  if ((state & PROPAGATE_SLOW_STATE) === 0) {
    const next = (state & ~Reentrant) | Invalid;
    sub.state = next;

    if (__DEV__) {
      devRecordPropagate(edge, next, false, defaultContext);
    }

    return next;
  }

  return invalidateSub(edge, sub, state, Invalid);
}

// @__INLINE__
function drainInvalid(edge: ReactiveEdge, top: number, base: number): void {
  let nextEdge: ReactiveEdge | null = edge.nextOut;

  while (true) {
    const sub = edge.to;
    const next = markInvalid(edge, sub);

    if ((next & Watcher) !== 0) {
      setPropagateStackHigh(top);
      notifyWatcher(sub);
    } else if (next !== 0) {
      const child = sub.firstOut;

      if (child !== null) {
        if (nextEdge !== null) {
          top = pushPropagateStack(nextEdge, top);
        }

        edge = child;
        nextEdge = edge.nextOut;
        continue;
      }
    }

    if (nextEdge !== null) {
      edge = nextEdge;
      nextEdge = edge.nextOut;
      continue;
    }

    if (top === base) {
      return;
    }

    edge = readPropagateStack(--top);
    nextEdge = edge.nextOut;
  }
}

export function propagateChanged(startEdge: ReactiveEdge): void {
  const base = getPropagateStackBase();
  let top = base;
  let pendingChild: ReactiveEdge | null = null;
  let edge: ReactiveEdge | null = startEdge;

  do {
    const sub = edge.to;
    const next = markChanged(edge, sub);

    if ((next & Watcher) !== 0) {
      setPropagateStackHigh(top);
      notifyWatcher(sub);
    } else if (next !== 0) {
      const child = sub.firstOut;

      if (child !== null) {
        if (pendingChild !== null) {
          top = pushPropagateStack(pendingChild, top);
        }

        pendingChild = child;
      }
    }

    edge = edge.nextOut;
  } while (edge !== null);

  if (pendingChild === null) {
    return;
  }

  drainInvalid(pendingChild, top, base);
  restorePropagateStackBase(base);
}

export function propagate(startEdge: ReactiveEdge, _promote: typeof Changed): void {
  propagateChanged(startEdge);
}

export function readPropagateStackStats(): {
  shouldRecompute: { current: number; peak: number; capacity: number };
  propagate: { current: number; peak: number; capacity: number };
} {
  return readPropagateStackStatsFromStorage();
}
