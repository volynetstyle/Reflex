import type { ReactiveEdge, ReactiveNode } from "../shape";
import { Changed, Disposed, Invalid, Watcher } from "../shape";
import { notifyWatcher } from "./invalidateBranch";

const PROPAGATE_ONCE_CLEAN_CONSUMER_SLOW_STATE =
  Disposed | Changed | Invalid | Watcher;

function propagateOnceFrom(firstOut: ReactiveEdge | null): void {
  for (let edge = firstOut; edge !== null; edge = edge.nextOut) {
    const sub = edge.to,
      state = sub.state;

    if ((state & PROPAGATE_ONCE_CLEAN_CONSUMER_SLOW_STATE) === 0) {
      sub.state = state | Changed;
      continue;
    }

    if ((state & (Disposed | Changed)) === 0) {
      sub.state = (state & ~Invalid) | Changed;
      if ((state & Watcher) !== 0) notifyWatcher(sub);
    }
  }
}

export function propagateOnce(node: ReactiveNode): void {
  propagateOnceFrom(node.firstOut);
}

export function propagateOnceFromEdge(edge: ReactiveEdge): void {
  propagateOnceFrom(edge);
}
