import { defaultContext, emitNodeInvalidated } from "@runtime/kernel/config";
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
  if (__PROFILE__) profileRuntimeCounter("pushOnceCalls");

  // Split around `skip` so the hot suffix only tests its termination pointer
  // instead of checking `skip` for every remaining edge.
  for (let current = edge; current !== skip; current = current.nextOut) {
    // Preserve the old no-op behavior when a foreign skip edge is supplied.
    if (current === null) return;

    if (__PROFILE__) profileRuntimeCounter("pushOnceEdgesVisited");

    const sub = current.to;
    const state = sub.state;

    if ((state & Changed) === 0) {
      sub.state = (state & ~Unknown) | Changed;

      if (__PROFILE__) profileRuntimeCounter("pushOnceMarkedChanged");
      if (__DEV__) devRecordPropagate(current, sub.state, true, defaultContext);

      if ((state & Watcher) !== 0) {
        emitNodeInvalidated(sub);
      }
    } else {
      if (__PROFILE__) profileRuntimeCounter("pushOnceAlreadyChangedSkipped");
    }
  }

  if (__PROFILE__) profileRuntimeCounter("pushOnceSkippedEdges");

  for (
    let current = skip.nextOut;
    current !== null;
    current = current.nextOut
  ) {
    if (__PROFILE__) profileRuntimeCounter("pushOnceEdgesVisited");

    const sub = current.to;
    const state = sub.state;

    if ((state & Changed) === 0) {
      sub.state = (state & ~Unknown) | Changed;

      if (__PROFILE__) profileRuntimeCounter("pushOnceMarkedChanged");
      if (__DEV__) devRecordPropagate(current, sub.state, true, defaultContext);

      if ((state & Watcher) !== 0) {
        emitNodeInvalidated(sub);
      }
    } else if (__PROFILE__) {
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
