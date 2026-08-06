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

function pushIteratorOnceSkippingCore(
  edge: ReactiveEdge | null,
  skip: ReactiveEdge,
): void {
  profileRuntimeCounter("pushOnceCalls");

  // Split around `skip` so the hot suffix only tests its termination pointer
  // instead of checking `skip` for every remaining edge.
  for (let current = edge; current !== skip; current = current.nextOut) {
    // Preserve the old no-op behavior when a foreign skip edge is supplied.
    if (current === null) return;

    profileRuntimeCounter("pushOnceEdgesVisited");

    const sub = current.to;
    const state = sub.state;

    if ((state & Changed) === 0) {
      sub.state = (state & ~Unknown) | Changed;

      profileRuntimeCounter("pushOnceMarkedChanged");
      devRecordPropagate(current, sub.state, true, defaultContext);

      if ((state & Watcher) !== 0 && nodeInvalidatedHook) {
        if (__DEV__) emitNodeInvalidated(sub);

        if (!__DEV__)nodeInvalidatedHook(sub);
      }
    } else {
      profileRuntimeCounter("pushOnceAlreadyChangedSkipped");
    }
  }

  profileRuntimeCounter("pushOnceSkippedEdges");

  for (
    let current = skip.nextOut;
    current !== null;
    current = current.nextOut
  ) {
    profileRuntimeCounter("pushOnceEdgesVisited");

    const sub = current.to;
    const state = sub.state;

    if ((state & Changed) === 0) {
      sub.state = (state & ~Unknown) | Changed;

      profileRuntimeCounter("pushOnceMarkedChanged");
      devRecordPropagate(current, sub.state, true, defaultContext);

      if ((state & Watcher) !== 0 && nodeInvalidatedHook) {
        if (__DEV__) emitNodeInvalidated(sub);

       if (!__DEV__) nodeInvalidatedHook!(sub);
      }
    } else {
      profileRuntimeCounter("pushOnceAlreadyChangedSkipped");
    }
  }
}

export const push_iterator_once_skipping: (
  edge: ReactiveEdge | null,
  skip: ReactiveEdge,
) => void = __DEV__
  ? function pushIteratorOnceSkippingDev(edge, skip): void {
      enterRuntimePhase(RuntimePhase.Propagating);

      try {
        pushIteratorOnceSkippingCore(edge, skip);
      } finally {
        leaveRuntimePhase();
      }
    }
  : pushIteratorOnceSkippingCore;
