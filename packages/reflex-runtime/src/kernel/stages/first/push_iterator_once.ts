import { emitSinkInvalidated } from "../../context";
import { profileRuntimeCounter } from "../../../profiling";
import type { ReactiveEdge } from "../../shape";
import { Changed, Invalid, Watcher } from "../../shape";

export function push_iterator_once(edge: ReactiveEdge | null): void {
  profileRuntimeCounter("pushOnceCalls");

  for (let current = edge; current !== null; current = current.nextOut) {
    profileRuntimeCounter("pushOnceEdgesVisited");

    const sub = current.to;
    const state = sub.state;

    if ((state & Changed) === 0) {
      sub.state = (state & ~Invalid) | Changed;

      profileRuntimeCounter("pushOnceMarkedChanged");

      if ((state & Watcher) !== 0) {
        emitSinkInvalidated(sub);
      }
    } else {
      profileRuntimeCounter("pushOnceAlreadyChangedSkipped");
    }
  }
}
