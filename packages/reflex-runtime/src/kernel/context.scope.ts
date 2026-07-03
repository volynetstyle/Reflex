import { recordDebugEvent } from "@runtime/debug/debug.runtime";
import { profileRuntimeCounter } from "@runtime/profiling";

import { emitReactiveSettledWithBatching } from "./batch";
import { defaultContext } from "./config";
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

  if (leavePropagationScopeRegister()) emitReactiveSettledWithBatching();
}

export function emitSettledIfIdle(): void {
  profileRuntimeCounter("contextSettledChecks");
  if (!isRuntimeExecutionIdle()) return;

  if (IS_DEV) recordDebugEvent(defaultContext, "context:settled");
  emitReactiveSettledWithBatching();
}
