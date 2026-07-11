import { recordDebugEvent } from "@runtime/debug/debug.runtime";
import { profileRuntimeCounter } from "@runtime/profiling";

import { emitReactiveSettledWithBatching } from "./batch";
import { defaultContext, reactiveSettledHook } from "./config";
import {
  enterPropagationScopeRegister,
  isRuntimeExecutionIdle,
  leavePropagationScopeRegister,
} from "./state";

const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

export function enterPropagationScope(): void {
  profileRuntimeCounter("propagationScopesEntered");
  profileRuntimeCounter("contextPropagationEnter");
  enterPropagationScopeRegister();
}

export function leavePropagationScope(): void {
  profileRuntimeCounter("propagationScopesLeft");
  profileRuntimeCounter("contextPropagationLeave");

  if (!leavePropagationScopeRegister()) return;

  // Low-level runtimes commonly have no host settlement hook. Keep profile
  // counters and development debug events intact while avoiding the batching
  // dispatcher on the production no-hook path.
  if (!IS_DEV && !__PROFILE__ && reactiveSettledHook === undefined) return;

  emitReactiveSettledWithBatching();
}

export function emitSettledIfIdle(): void {
  profileRuntimeCounter("contextSettledChecks");

  if (!IS_DEV && !__PROFILE__ && reactiveSettledHook === undefined) return;
  if (!isRuntimeExecutionIdle()) return;

  if (IS_DEV) recordDebugEvent(defaultContext, "context:settled");
  emitReactiveSettledWithBatching();
}
