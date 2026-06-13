import { emitSinkInvalidated } from "../../context";
import type { ReactiveEdge } from "../../shape";
import { Changed, Invalid, Watcher } from "../../shape";

export function push_iterator_once_skipping(
  edge: ReactiveEdge | null,
  skip: ReactiveEdge,
): void {
  for (let current = edge; current !== null; current = current.nextOut) {
    if (current === skip) continue;

    const sub = current.to;
    const state = sub.state;

    if ((state & Changed) === 0) {
      sub.state = (state & ~Invalid) | Changed;

      if ((state & Watcher) !== 0) {
        emitSinkInvalidated(sub);
      }
    }
  }
}
