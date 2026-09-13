import { recordDebugEvent } from "../../debug/debug.runtime";
import { observeRuntimeProjection } from "@runtime/kernel/projection";

import { emitRuntimeIdleWithBatching } from "./batch";
import { defaultContext, runtimeIdleHook } from "./config";
import {
  enterPropagationScopeRegister,
  leavePropagationScopeRegister,
  markRuntimeIdlePending,
  propagationScopeDepth,
  RuntimeState,
  runtimeState,
  setPropagationScopeDepth,
} from "./state";

const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

export const enterPropagationScope = !__PROFILE__
  ? enterPropagationScopeRegister
  : function (): void {
      if (__PROFILE__)
        observeRuntimeProjection?.(
          "projection.semantic.context.propagation.scope-enter",
        );
      if (__PROFILE__)
        observeRuntimeProjection?.(
          "projection.semantic.context.propagation.enter",
        );
      enterPropagationScopeRegister();
    };

export function leavePropagationScope(): void {
  if (__PROFILE__)
    observeRuntimeProjection?.(
      "projection.semantic.context.propagation.scope-leave",
    );
  if (__PROFILE__)
    observeRuntimeProjection?.("projection.semantic.context.propagation.leave");

  if (!leavePropagationScopeRegister()) {
    if (
      propagationScopeDepth === 0 &&
      (runtimeIdleHook !== undefined ||
        (runtimeState & RuntimeState.HostWorkPending) !== RuntimeState.Idle)
    ) {
      markRuntimeIdlePending();
    }
    return;
  }

  // Low-level runtimes commonly have no host settlement hook. Keep profile
  // counters and development debug events intact while avoiding the batching
  // dispatcher on the production no-hook path.
  if (
    !IS_DEV &&
    !__PROFILE__ &&
    runtimeIdleHook === undefined &&
    (runtimeState & RuntimeState.HostWorkPending) === RuntimeState.Idle
  )
    return;

  emitRuntimeIdleWithBatching();
}

/** Leaves an aborted propagation scope without publishing a settled event. */
export function abortPropagationScope(): void {
  if (__PROFILE__)
    observeRuntimeProjection?.(
      "projection.semantic.context.propagation.scope-leave",
    );
  if (__PROFILE__)
    observeRuntimeProjection?.("projection.semantic.context.propagation.leave");
  setPropagationScopeDepth(0);
}

export function emitSettledIfIdle(): void {
  if (__PROFILE__)
    observeRuntimeProjection?.("projection.semantic.context.settled.check");

  if (
    !IS_DEV &&
    !__PROFILE__ &&
    runtimeIdleHook === undefined &&
    (runtimeState & RuntimeState.HostWorkPending) === RuntimeState.Idle
  )
    return;
  if (
    (runtimeState & (RuntimeState.Tracking | RuntimeState.Propagating)) !==
    RuntimeState.Idle
  ) {
    if (
      propagationScopeDepth === 0 &&
      (runtimeIdleHook !== undefined ||
        (runtimeState & RuntimeState.HostWorkPending) !== RuntimeState.Idle)
    ) {
      markRuntimeIdlePending();
    }
    return;
  }

  if (IS_DEV) recordDebugEvent(defaultContext, "context:settled");
  emitRuntimeIdleWithBatching();
}
