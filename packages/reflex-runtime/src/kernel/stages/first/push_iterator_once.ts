import { defaultContext, emitSinkInvalidated } from "@runtime/kernel/config";
import { devRecordPropagate } from "@runtime/kernel/dev";
import {
  enterRuntimePhase,
  leaveRuntimePhase,
  RuntimePhase,
} from "@runtime/kernel/execution";
import {
  Changed,
  Unknown,
  Watcher,
  type ReactiveEdge,
} from "@runtime/kernel/shape";
import { profileRuntimeCounter } from "@runtime/profiling";

function pushIteratorOnceCore(edge: ReactiveEdge | null): void {
  if (__PROFILE__) profileRuntimeCounter("pushOnceCalls");

  for (let current = edge; current !== null; current = current.nextOut) {
    if (__PROFILE__) profileRuntimeCounter("pushOnceEdgesVisited");

    const sub = current.to;
    const state = sub.state;

    if ((state & Changed) === 0) {
      sub.state = (state & ~Unknown) | Changed;

      if (__PROFILE__) profileRuntimeCounter("pushOnceMarkedChanged");
      if (__DEV__) devRecordPropagate(current, sub.state, true, defaultContext);

      if ((state & Watcher) !== 0) {
        emitSinkInvalidated(sub);
      }
    } else {
      if (__PROFILE__) profileRuntimeCounter("pushOnceAlreadyChangedSkipped");
    }
  }
}

export const push_iterator_once: (edge: ReactiveEdge | null) => void = __DEV__
  ? function pushIteratorOnceDev(edge): void {
      enterRuntimePhase(RuntimePhase.Propagating);

      try {
        pushIteratorOnceCore(edge);
      } finally {
        leaveRuntimePhase();
      }
    }
  : pushIteratorOnceCore;
