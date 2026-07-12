import {
  restoreRuntimeConfiguration,
  saveRuntimeConfiguration,
} from "./config";
import { createRuntimeContext, type RuntimeContext } from "./context.model";
import {
  currentConsumer,
  pendingReactiveSettled,
  propagationScopeDepth,
  reactiveBatchDepth,
  setCurrentConsumer,
  setPropagationScopeDepth,
  setReactiveBatchState,
  setTrackingEpoch,
  trackingEpoch,
} from "./state";

let activeRuntimeContext = createRuntimeContext();

export function getActiveRuntimeContext(): RuntimeContext {
  return activeRuntimeContext;
}

export function syncRuntimeContext(
  context: RuntimeContext,
  direction: "load" | "save",
): void {
  if (direction === "load") {
    setCurrentConsumer(context.currentConsumer);
    setTrackingEpoch(context.trackingEpoch);
    setPropagationScopeDepth(context.propagationScopeDepth);
    setReactiveBatchState(context.batchDepth, context.pendingReactiveSettled);
    restoreRuntimeConfiguration(context);
    return;
  }

  context.currentConsumer = currentConsumer;
  context.trackingEpoch = trackingEpoch;
  context.propagationScopeDepth = propagationScopeDepth;
  context.batchDepth = reactiveBatchDepth;
  context.pendingReactiveSettled = pendingReactiveSettled;
  Object.assign(context, saveRuntimeConfiguration());
}

export function switchRuntimeContext(next: RuntimeContext): void {
  if (next === activeRuntimeContext) return;

  syncRuntimeContext(activeRuntimeContext, "save");
  activeRuntimeContext = next;
  syncRuntimeContext(next, "load");
}
