import { profileRuntimeCounter } from "@runtime/profiling";

import { DEFAULT_READ_TRACKING_STRATEGY } from "./config";
import {
  applyRuntimeContextOptions,
  createRuntimeContext,
  isRuntimeContext,
  type RuntimeContext,
  type RuntimeContextOptions,
  type RuntimeContextSnapshot,
} from "./context.model";
import {
  getActiveRuntimeContext,
  switchRuntimeContext,
  syncRuntimeContext,
} from "./context.switch";
import { resetRuntimeExecutionState } from "./execution";
import { trackingEpoch } from "./state";

export { createRuntimeContext, getActiveRuntimeContext };
export type {
  RuntimeContext,
  RuntimeContextOptions,
  RuntimeContextSnapshot,
} from "./context.model";
export type { RuntimeHooks, RuntimeHostHooks } from "./config";

export function runWithRuntimeContext<T>(
  context: RuntimeContext,
  fn: () => T,
): T {
  profileRuntimeCounter("contextRunCalls");
  const previous = getActiveRuntimeContext();
  if (previous === context) return fn();

  profileRuntimeCounter("contextSwitches");
  switchRuntimeContext(context);
  try {
    return fn();
  } finally {
    switchRuntimeContext(previous);
  }
}

export function configureRuntimeContext(
  context: RuntimeContext,
  options?: RuntimeContextOptions,
): void;
export function configureRuntimeContext(options?: RuntimeContextOptions): void;
export function configureRuntimeContext(
  contextOrOptions: RuntimeContext | RuntimeContextOptions = {},
  maybeOptions: RuntimeContextOptions = {},
): void {
  const explicitContext = isRuntimeContext(contextOrOptions);
  const context = explicitContext
    ? contextOrOptions
    : getActiveRuntimeContext();
  applyRuntimeContextOptions(
    context,
    explicitContext ? maybeOptions : contextOrOptions,
  );
  if (context === getActiveRuntimeContext())
    syncRuntimeContext(context, "load");
}

export function resetRuntimeContext(
  context: RuntimeContext = getActiveRuntimeContext(),
): void {
  context.currentConsumer = null;
  context.trackingEpoch = 0;
  context.propagationScopeDepth = 0;
  context.batchDepth = 0;
  context.runtimeState = 0;
  context.readTrackingStrategy = DEFAULT_READ_TRACKING_STRATEGY;
  context.nodeInvalidatedHook = undefined;
  context.runtimeIdleHook = undefined;

  if (context === getActiveRuntimeContext()) {
    resetRuntimeExecutionState();
    syncRuntimeContext(context, "load");
  }
}

export function snapshotRuntimeContext(
  context: RuntimeContext = getActiveRuntimeContext(),
): RuntimeContextSnapshot {
  if (context === getActiveRuntimeContext())
    syncRuntimeContext(context, "save");
  const {
    currentConsumer,
    trackingEpoch,
    propagationScopeDepth,
    batchDepth,
    runtimeState,
    readTrackingStrategy,
    nodeInvalidatedHook,
    runtimeIdleHook,
  } = context;
  return {
    currentConsumer,
    trackingEpoch,
    propagationScopeDepth,
    batchDepth,
    runtimeState,
    readTrackingStrategy,
    nodeInvalidatedHook,
    runtimeIdleHook,
  };
}

export function restoreRuntimeContextSnapshot(
  context: RuntimeContext,
  snapshot: RuntimeContextSnapshot,
): void {
  const currentEpoch =
    context === getActiveRuntimeContext()
      ? trackingEpoch
      : context.trackingEpoch;
  Object.assign(context, snapshot, {
    trackingEpoch: Math.max(snapshot.trackingEpoch, currentEpoch),
  });
  if (context === getActiveRuntimeContext())
    syncRuntimeContext(context, "load");
}
