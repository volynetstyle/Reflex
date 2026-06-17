import { emitSinkInvalidated } from "../../context";
import { profileRuntimeCounter } from "../../../profiling";
import { defaultContext } from "../../context";
import { devRecordPropagate } from "../../dev";
import {
  enterRuntimePhase,
  leaveRuntimePhase,
  RuntimePhase,
} from "../../execution";
import type { ReactiveEdge } from "../../shape";
import { Changed, Invalid, Watcher } from "../../shape";

export function push_iterator_once_skipping(
  edge: ReactiveEdge | null,
  skip: ReactiveEdge,
): void {
  if (__DEV__) enterRuntimePhase(RuntimePhase.Propagating);

  try {
    profileRuntimeCounter("pushOnceCalls");

    for (let current = edge; current !== null; current = current.nextOut) {
      if (current === skip) {
        profileRuntimeCounter("pushOnceSkippedEdges");
        continue;
      }

      profileRuntimeCounter("pushOnceEdgesVisited");

      const sub = current.to;
      const state = sub.state;

      if ((state & Changed) === 0) {
        sub.state = (state & ~Invalid) | Changed;

        profileRuntimeCounter("pushOnceMarkedChanged");
        if (__DEV__)
          devRecordPropagate(current, sub.state, true, defaultContext);

        if ((state & Watcher) !== 0) {
          emitSinkInvalidated(sub);
        }
      } else {
        profileRuntimeCounter("pushOnceAlreadyChangedSkipped");
      }
    }
  } finally {
    if (__DEV__) leaveRuntimePhase();
  }
}
