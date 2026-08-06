import {
  defaultContext,
  emitNodeInvalidated,
  nodeInvalidatedHook,
} from "@runtime/kernel/config";
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
  profileRuntimeCounter("pushOnceCalls");

  for (let current = edge; current !== null; current = current.nextOut) {
    profileRuntimeCounter("pushOnceEdgesVisited");

    const sub = current.to;
    const state = sub.state;

    if ((state & Changed) === 0) {
      sub.state = (state & ~Unknown) | Changed;

      profileRuntimeCounter("pushOnceMarkedChanged");
      devRecordPropagate(current, sub.state, true, defaultContext);

      if ((state & Watcher) !== 0 && nodeInvalidatedHook) {
        if (__DEV__) emitNodeInvalidated(sub);

        if (!__DEV__)nodeInvalidatedHook!(sub);
      }
    } else {
      profileRuntimeCounter("pushOnceAlreadyChangedSkipped");
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
