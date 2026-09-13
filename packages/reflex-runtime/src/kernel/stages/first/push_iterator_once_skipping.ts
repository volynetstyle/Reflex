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

function pushIteratorOnceSkippingCore(
  edge: ReactiveEdge | null,
  skip: ReactiveEdge,
): void {
  if (__PROFILE__)
    observeRuntimeProjection?.("projection.semantic.push-once.invoke");

  // Split around `skip` so the hot suffix only tests its termination pointer
  // instead of checking `skip` for every remaining edge.
  for (let current = edge; current !== skip; current = current.nextOut) {
    // Preserve the old no-op behavior when a foreign skip edge is supplied.
    if (current === null) return;

    if (__PROFILE__)
      observeRuntimeProjection?.("projection.semantic.push-once.edge.visit");

    const sub = current.to;
    const state = sub.state;

    if ((state & Changed) === 0) {
      sub.state = (state & ~Unknown) | Changed;

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

        if (!__DEV__) nodeInvalidatedHook(sub);
      }
    } else {
      if (__PROFILE__)
        observeRuntimeProjection?.(
          "projection.semantic.push-once.subscriber.changed.skip",
        );
    }
  }

  if (__PROFILE__)
    observeRuntimeProjection?.(
      "projection.semantic.push-once.edge.explicit-skip",
    );

  for (
    let current = skip.nextOut;
    current !== null;
    current = current.nextOut
  ) {
    if (__PROFILE__)
      observeRuntimeProjection?.("projection.semantic.push-once.edge.visit");

    const sub = current.to;
    const state = sub.state;

    if ((state & Changed) === 0) {
      sub.state = (state & ~Unknown) | Changed;

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
