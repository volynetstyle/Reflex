import {
  DEFAULT_GRAPH_REDUCTION_OPTIONS,
  DEFAULT_READ_TRACKING_STRATEGY,
} from "./defaults";
import {
  commitRuntimeContext,
  getActiveRuntimeContext,
  reloadActiveContextIfCurrent,
  trackingEpoch,
} from "./state";
import type { RuntimeContext, RuntimeContextSnapshot } from "./types";

export function saveRuntimeContext(
  context: RuntimeContext,
): RuntimeContextSnapshot {
  return {
    currentConsumer: context.currentConsumer,
    trackingEpoch: context.trackingEpoch,
    propagationScopeDepth: context.propagationScopeDepth,
    readTrackingStrategy: context.readTrackingStrategy,
    graphReductionPolicy: context.graphReductionPolicy,
    internalSinkInvalidatedHook: context.internalSinkInvalidatedHook,
    internalReactiveSettledHook: context.internalReactiveSettledHook,
    hostSinkInvalidatedHook: context.hostSinkInvalidatedHook,
    hostReactiveSettledHook: context.hostReactiveSettledHook,
    hostEffectCleanupHook: context.hostEffectCleanupHook,
  };
}

export function restoreRuntimeContext(
  context: RuntimeContext,
  snapshot: RuntimeContextSnapshot,
): void {
  const activeContext = getActiveRuntimeContext();
  const currentEpoch =
    context === activeContext ? trackingEpoch : context.trackingEpoch;

  context.currentConsumer = snapshot.currentConsumer;
  context.trackingEpoch =
    snapshot.trackingEpoch > currentEpoch
      ? snapshot.trackingEpoch
      : currentEpoch;
  context.propagationScopeDepth = snapshot.propagationScopeDepth;
  context.readTrackingStrategy = snapshot.readTrackingStrategy;
  context.graphReductionPolicy = snapshot.graphReductionPolicy;
  context.internalSinkInvalidatedHook = snapshot.internalSinkInvalidatedHook;
  context.internalReactiveSettledHook = snapshot.internalReactiveSettledHook;
  context.hostSinkInvalidatedHook = snapshot.hostSinkInvalidatedHook;
  context.hostReactiveSettledHook = snapshot.hostReactiveSettledHook;
  context.hostEffectCleanupHook = snapshot.hostEffectCleanupHook;
  reloadActiveContextIfCurrent(context);
}

export function saveContext(): RuntimeContextSnapshot {
  commitRuntimeContext();
  return saveRuntimeContext(getActiveRuntimeContext());
}

export function restoreContext(snapshot: RuntimeContextSnapshot): void {
  restoreRuntimeContext(getActiveRuntimeContext(), snapshot);
}

export function resetState(
  context: RuntimeContext = getActiveRuntimeContext(),
): void {
  context.currentConsumer = null;
  context.trackingEpoch = 0;
  context.propagationScopeDepth = 0;
  context.readTrackingStrategy = DEFAULT_READ_TRACKING_STRATEGY;
  context.graphReductionPolicy = DEFAULT_GRAPH_REDUCTION_OPTIONS;
  reloadActiveContextIfCurrent(context);
}
