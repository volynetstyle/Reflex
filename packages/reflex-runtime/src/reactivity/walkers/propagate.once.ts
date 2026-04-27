import { devAssertPropagateAlive } from "../dev";
import type { ReactiveNode } from "../shape";
import { Changed, Disposed, Invalid } from "../shape";
import { WATCHER_MASK } from "./propagate.constants";
import { dispatchInvalidatedWatcher } from "./propagate.invalidate";

export function propagateOnce(node: ReactiveNode): void {
  if ((node.state & Disposed) !== 0) {
    if (__DEV__) devAssertPropagateAlive();
    return;
  }

  for (let edge = node.firstOut; edge !== null; edge = edge.nextOut) {
    const sub = edge.to,
      state = sub.state;

    if ((state & Changed) === 0) {
      sub.state = (state & ~Invalid) | Changed;
      if ((state & WATCHER_MASK) !== 0) dispatchInvalidatedWatcher(sub);
    }
  }
}
