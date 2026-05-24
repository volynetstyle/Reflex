import { recordDebugEvent } from "../../debug/debug.runtime";
import type { ReactiveNode } from "../shape";
import { defaultContext } from "./defaults";
import {
  currentConsumer,
  decrementPropagationScopeDepth,
  hostReactiveSettledHook,
  hostSinkInvalidatedHook,
  incrementPropagationScopeDepth,
  internalReactiveSettledHook,
  internalSinkInvalidatedHook,
  propagationScopeDepth,
} from "./state";

const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

// @__INLINE__
export function enterPropagationScope(): void {
  incrementPropagationScopeDepth();
}

// @__INLINE__
export function leavePropagationScope(): void {
  decrementPropagationScopeDepth();
  if (!propagationScopeDepth && currentConsumer === null) {
    dispatchReactiveSettled();
  }
}

// @__INLINE__
export function emitSinkInvalidated(node: ReactiveNode): void {
  if (IS_DEV) recordDebugEvent(defaultContext, "watcher:invalidated", { node });
  internalSinkInvalidatedHook?.(node);
  hostSinkInvalidatedHook?.(node);
}

// @__INLINE__
export function emitSettledIfIdle(): void {
  if (propagationScopeDepth !== 0 || currentConsumer !== null) return;
  if (IS_DEV) recordDebugEvent(defaultContext, "context:settled");
  dispatchReactiveSettled();
}

function dispatchReactiveSettled(): void {
  internalReactiveSettledHook?.();
  hostReactiveSettledHook?.();
}
