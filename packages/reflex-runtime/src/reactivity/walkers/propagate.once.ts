import type { ReactiveNode } from "../shape";
import { Changed, Invalid, Watcher } from "../shape";
import { notifyWatcher } from "./propagate.invalidate";

export function propagateOnce(node: ReactiveNode): void {
  for (let edge = node.firstOut; edge !== null; edge = edge.nextOut) {
    const sub = edge.to,
      state = sub.state;

    if ((state & Changed) === 0) {
      sub.state = (state & ~Invalid) | Changed;
      if ((state & Watcher) !== 0) notifyWatcher(sub);
    }
  }
}
