import { emitSinkInvalidated } from "../execution";
import type { ReactiveEdge, ReactiveNode } from "../shape";
import { Changed, Invalid, Watcher } from "../shape";

export function propagateOnceFromEdge(edge: ReactiveEdge | null): void {
  for (let current = edge; current !== null; current = current.nextOut) {
    const sub = current.to;
    const state = sub.state;

    if ((state & Changed) !== 0) continue;

    sub.state = (state & ~Invalid) | Changed;

    if ((state & Watcher) !== 0) {
      emitSinkInvalidated(sub);
    }
  }
}

//
export function propagateOnce(node: ReactiveNode): void {
  const firstOut = node.firstOut;
  if (firstOut !== null) propagateOnceFromEdge(firstOut);
}
