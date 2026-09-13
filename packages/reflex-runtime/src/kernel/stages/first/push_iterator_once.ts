import {
  defaultContext,
  emitNodeInvalidated,
  nodeInvalidatedHook,
} from "@runtime/kernel/config";
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
import { observeRuntimeProjection } from "@runtime/kernel/projection";
import { observeRuntimePropagate } from "@runtime/kernel/projection.propagate";

function pushIteratorOnceCore(edge: ReactiveEdge | null): void {
  if (__PROFILE__)
    observeRuntimeProjection?.("projection.semantic.push-once.invoke");

  for (let current = edge; current !== null; current = current.nextOut) {
    if (__PROFILE__)
      observeRuntimeProjection?.("projection.semantic.push-once.edge.visit");

    const sub = current.to;
    const state = sub.state;

    if ((state & Changed) === 0) {
      sub.state =
        (state & Watcher) !== 0
          ? state | Changed
          : (state & ~Unknown) | Changed;

      if (__PROFILE__)
        observeRuntimeProjection?.(
          "projection.semantic.push-once.subscriber.changed.mark",
        );
      if (__DEV__)
        observeRuntimePropagate?.({
          edge: current,
          nextState: sub.state,
          immediate: true,
          context: defaultContext,
        });

      if ((state & Watcher) !== 0 && nodeInvalidatedHook) {
        if (__DEV__) emitNodeInvalidated(sub);

        if (!__DEV__) nodeInvalidatedHook!(sub);
      }
    } else {
      if (__PROFILE__)
        observeRuntimeProjection?.(
          "projection.semantic.push-once.subscriber.changed.skip",
        );
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
