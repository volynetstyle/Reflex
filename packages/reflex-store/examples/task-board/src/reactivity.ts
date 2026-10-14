// Application wiring for this example; the store does not own a host runtime.
import {
  createRuntimeContext,
  createWatcher,
  disposeWatcher,
  runWatcher,
  switchRuntimeContext,
} from "@volynets/reflex-runtime/internal";
import {
  createRuntimeSchedulerBinding,
  resolveEffectSchedulerMode,
  type EffectStrategy,
} from "@volynets/reflex-scheduler";

export function createRuntime({
  effectStrategy = "eager",
}: { effectStrategy?: EffectStrategy } = {}) {
  const context = createRuntimeContext();
  const scheduler = createRuntimeSchedulerBinding(
    resolveEffectSchedulerMode(effectStrategy),
    context,
  );
  context.nodeInvalidatedHook = scheduler.onNodeInvalidated;
  context.hostFlushHook = scheduler.onHostFlush;
  switchRuntimeContext(context);
  return { flush: scheduler.flush };
}

export function effect(callback: () => void | (() => void)): () => void {
  const node = createWatcher(callback);
  runWatcher(node);
  return () => disposeWatcher(node);
}
