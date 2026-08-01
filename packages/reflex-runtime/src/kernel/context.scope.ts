import { recordDebugEvent } from "@runtime/debug/debug.runtime";
import { profileRuntimeCounter } from "@runtime/profiling";

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
      profileRuntimeCounter("propagationScopesEntered");
      profileRuntimeCounter("contextPropagationEnter");
      enterPropagationScopeRegister();
    };

export function leavePropagationScope(): void {
  profileRuntimeCounter("propagationScopesLeft");
  profileRuntimeCounter("contextPropagationLeave");

  if (!leavePropagationScopeRegister()) {
    if (propagationScopeDepth === 0 && runtimeIdleHook !== undefined) {
      markRuntimeIdlePending();
    }
    return;
  }

  // Low-level runtimes commonly have no host settlement hook. Keep profile
  // counters and development debug events intact while avoiding the batching
  // dispatcher on the production no-hook path.
  if (!IS_DEV && !__PROFILE__ && runtimeIdleHook === undefined) return;

  emitRuntimeIdleWithBatching();
}

/** Leaves an aborted propagation scope without publishing a settled event. */
export function abortPropagationScope(): void {
  profileRuntimeCounter("propagationScopesLeft");
  profileRuntimeCounter("contextPropagationLeave");
  setPropagationScopeDepth(0);
}

export function emitSettledIfIdle(): void {
  profileRuntimeCounter("contextSettledChecks");

  if (!IS_DEV && !__PROFILE__ && runtimeIdleHook === undefined) return;
  if (
    (runtimeState & (RuntimeState.Tracking | RuntimeState.Propagating)) !==
    RuntimeState.Idle
  ) {
    if (propagationScopeDepth === 0 && runtimeIdleHook !== undefined) {
      markRuntimeIdlePending();
    }
    return;
  }

  if (IS_DEV) recordDebugEvent(defaultContext, "context:settled");
  emitRuntimeIdleWithBatching();
}
