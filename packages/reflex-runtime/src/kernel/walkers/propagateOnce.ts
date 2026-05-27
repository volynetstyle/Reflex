import type { ReactiveEdge, ReactiveNode } from "../shape";
import { Changed, Invalid, Watcher } from "../shape";
import { notifyWatcher } from "./invalidateBranch";

const PROPAGATE_ONCE_SLOW_MASK = Changed | Invalid | Watcher;

// @__INLINE__
export function propagateOnceFromEdge(firstOut: ReactiveEdge | null): void {
  for (let edge = firstOut; edge !== null; edge = edge.nextOut) {
    const sub = edge.to;
    const state = sub.state;

    // no one of that, so clean than mark downstream
    if ((state & PROPAGATE_ONCE_SLOW_MASK) === 0) {
      sub.state = state | Changed;
      continue;
    }

    if ((state & Changed) !== 0) continue;

    sub.state = (state & ~Invalid) | Changed;

    if ((state & Watcher) !== 0) {
      notifyWatcher(sub);
    }
  }
}

export function propagateOnceFromEdgeNonNull(edge: ReactiveEdge): void {
  let current: ReactiveEdge | null = edge;

  do {
    const sub = current.to;
    const state = sub.state;

    if ((state & PROPAGATE_ONCE_SLOW_MASK) === 0) {
      sub.state = state | Changed;
    } else {
      propagateOnceSlow(sub, state);
    }

    current = current.nextOut;
  } while (current !== null);
}

function propagateOnceSlow(sub: ReactiveNode, state: number): void {
  if ((state & Changed) !== 0) {
    return;
  }

  sub.state = (state & ~Invalid) | Changed;

  if ((state & Watcher) !== 0) {
    notifyWatcher(sub);
  }
}

// @__INLINE__
export const propagateOnce = (node: ReactiveNode) =>
  propagateOnceFromEdge(node.firstOut);
