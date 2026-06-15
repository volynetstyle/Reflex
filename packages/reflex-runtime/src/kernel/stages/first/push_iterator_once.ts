import { emitSinkInvalidated } from "../../context";
import {
  runtimeProfileCounters,
  runtimeProfileCountersEnabled,
} from "../../../profiling";
import type { ReactiveEdge } from "../../shape";
import { Changed, Invalid, Watcher } from "../../shape";

export function push_iterator_once(edge: ReactiveEdge | null): void {
  if (__PROFILE__ && runtimeProfileCountersEnabled) {
    runtimeProfileCounters.pushOnceCalls += 1;
  }

  for (let current = edge; current !== null; current = current.nextOut) {
    if (__PROFILE__ && runtimeProfileCountersEnabled) {
      runtimeProfileCounters.pushOnceEdgesVisited += 1;
    }

    const sub = current.to;
    const state = sub.state;

    if ((state & Changed) === 0) {
      sub.state = (state & ~Invalid) | Changed;

      if (__PROFILE__ && runtimeProfileCountersEnabled) {
        runtimeProfileCounters.pushOnceMarkedChanged += 1;
      }

      if ((state & Watcher) !== 0) {
        emitSinkInvalidated(sub);
      }
    } else if (__PROFILE__ && runtimeProfileCountersEnabled) {
      runtimeProfileCounters.pushOnceAlreadyChangedSkipped += 1;
    }
  }
}
