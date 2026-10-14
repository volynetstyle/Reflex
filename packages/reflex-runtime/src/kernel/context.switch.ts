import { loadRuntimeConfiguration } from "./config";
import { createRuntimeContext, type RuntimeContext } from "./context.model";
import {
  currentConsumer,
  keepNewestTrackingEpoch,
  propagationScopeDepth,
  reactiveBatchDepth,
  setCurrentConsumer,
  setPropagationScopeDepth,
  setReactiveBatchState,
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
      // One kernel-wide clock: edges are shared by every context and stamped
      // with pass epochs, so a load may only move the epoch forward.
      keepNewestTrackingEpoch(context.trackingEpoch);
      setPropagationScopeDepth(context.propagationScopeDepth);
      setReactiveBatchState(context.batchDepth, context.runtimeState);
      loadRuntimeConfiguration(context);
      return;
    }
    case "save": {
      context.currentConsumer = currentConsumer;
      context.trackingEpoch = trackingEpoch;
      context.propagationScopeDepth = propagationScopeDepth;
      context.batchDepth = reactiveBatchDepth;
      context.runtimeState = runtimeState;
    }
  }
}

export function switchRuntimeContext(next: RuntimeContext): void {
  if (next === activeRuntimeContext) return;

  syncRuntimeContext(activeRuntimeContext, "save");
  activeRuntimeContext = next;
  syncRuntimeContext(next, "load");
}
