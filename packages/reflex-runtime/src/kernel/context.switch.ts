import {
  restoreRuntimeConfiguration,
  saveRuntimeConfiguration,
} from "./config";
import { createRuntimeContext, type RuntimeContext } from "./context.model";
import {
  currentConsumer,
  propagationScopeDepth,
  reactiveBatchDepth,
  setCurrentConsumer,
  setPropagationScopeDepth,
  setReactiveBatchState,
  setTrackingEpoch,
  trackingEpoch,
  runtimeState,
} from "./state";

let activeRuntimeContext = createRuntimeContext();

export function getActiveRuntimeContext(): RuntimeContext {
  return activeRuntimeContext;
}

export function syncRuntimeContext(
  context: RuntimeContext,
  direction: "load" | "save",
): void {
  switch (direction) {
    case "load": {
      setCurrentConsumer(context.currentConsumer);
      setTrackingEpoch(context.trackingEpoch);
      setPropagationScopeDepth(context.propagationScopeDepth);
      setReactiveBatchState(context.batchDepth, context.runtimeState);
      restoreRuntimeConfiguration(context);
      return;
    }
    case "save": {
      context.currentConsumer = currentConsumer;
      context.trackingEpoch = trackingEpoch;
      context.propagationScopeDepth = propagationScopeDepth;
      context.batchDepth = reactiveBatchDepth;
      context.runtimeState = runtimeState;
      Object.assign(context, saveRuntimeConfiguration());
    }
  }
}

export function switchRuntimeContext(next: RuntimeContext): void {
  if (next === activeRuntimeContext) return;

  syncRuntimeContext(activeRuntimeContext, "save");
  activeRuntimeContext = next;
  syncRuntimeContext(next, "load");
}
