import { observeRuntimeProjection } from "@runtime/kernel/projection";

import {
  DEFAULT_READ_TRACKING_STRATEGY,
  loadRuntimeConfiguration,
} from "./config";
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
import { setTrackingEpoch, trackingEpoch } from "./state";

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
  if (__PROFILE__)
    observeRuntimeProjection?.("projection.semantic.context.run");
  const previous = getActiveRuntimeContext();
  if (previous === context) return fn();

  if (__PROFILE__)
    observeRuntimeProjection?.("projection.semantic.context.switch");
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
  // Configuration only: the active execution registers are live and the
  // context object holds stale copies of them until the next save.
  if (context === getActiveRuntimeContext()) loadRuntimeConfiguration(context);
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
  context.hostFlushHook = undefined;

  if (context === getActiveRuntimeContext()) {
    resetRuntimeExecutionState();
    syncRuntimeContext(context, "load");
    // Full kernel reset is the only operation allowed to rewind the clock.
    setTrackingEpoch(0);
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
    hostFlushHook,
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
    hostFlushHook,
  };
}

/**
 * Restores a register-bank checkpoint taken by `snapshotRuntimeContext`.
 *
 * Legal at a quiescent boundary of `context`, or to unwind to a checkpoint
 * taken by an enclosing frame that is still on the stack. The tracking epoch
 * is never restored: it is the kernel-wide clock, and any comparison with an
 * arbitrarily old snapshot epoch is ambiguous under uint32 wraparound.
 */
export function restoreRuntimeContextSnapshot(
  context: RuntimeContext,
  snapshot: RuntimeContextSnapshot,
): void {
  const active = context === getActiveRuntimeContext();
  if (active) context.trackingEpoch = trackingEpoch;
  context.currentConsumer = snapshot.currentConsumer;
  context.propagationScopeDepth = snapshot.propagationScopeDepth;
  context.batchDepth = snapshot.batchDepth;
  context.runtimeState = snapshot.runtimeState;
  context.readTrackingStrategy = snapshot.readTrackingStrategy;
  context.nodeInvalidatedHook = snapshot.nodeInvalidatedHook;
  context.runtimeIdleHook = snapshot.runtimeIdleHook;
  context.hostFlushHook = snapshot.hostFlushHook;
  if (active) syncRuntimeContext(context, "load");
}
