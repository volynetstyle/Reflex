import type { ReactiveEdge, ReactiveNode } from "../shape";
import { Changed, Invalid, Watcher } from "../shape";
import { notifyWatcher } from "./invalidateBranch";

const PROPAGATE_ONCE_CLEAN_CONSUMER_SLOW_STATE = Changed | Invalid | Watcher;

// @__INLINE__
export function propagateOnceFromEdge(firstOut: ReactiveEdge | null): void {
  for (let edge = firstOut; edge !== null; edge = edge.nextOut) {
    const sub = edge.to,
      state = sub.state;

    if ((state & PROPAGATE_ONCE_CLEAN_CONSUMER_SLOW_STATE) === 0) {
      sub.state = state | Changed;
      continue;
    }

    if ((state & Changed) === 0) {
      sub.state = (state & ~Invalid) | Changed;
      if ((state & Watcher) !== 0) notifyWatcher(sub);
    }
  }
}

// @__INLINE__
export function propagateOnce(node: ReactiveNode): void {
  propagateOnceFromEdge(node.firstOut);
}
