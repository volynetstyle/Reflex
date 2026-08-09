import {
  assertHookUsage,
  createOwnedEffect,
  getCurrentHookNode,
  getCurrentHookOwner,
  type Cleanup,
  type EffectCallback,
  type EffectCleanup,
} from "@volynets/reflex-framework";
import { getActiveDOMExecutionContext } from "../runtime/execution";
import { RenderEffectPhase } from "../runtime/render-effect-scheduler";

export function useEffectRender(callback: EffectCallback): EffectCleanup {
  assertHookUsage("useEffectRender");
  const scheduler = getActiveDOMExecutionContext().renderEffectScheduler;
  const owner = getCurrentHookOwner();
  const node = getCurrentHookNode();
  let disposed = false;
  let disposeEffect: Cleanup | null = null;

  const cancelScheduledTask = scheduler.schedule(() => {
    if (disposed) return;
    const effect = createOwnedEffect(owner, node, callback);
    if (disposed) effect();
    else disposeEffect = effect;
  }, RenderEffectPhase.Render);

  const dispose = (() => {
    if (disposed) return;
    disposed = true;
    cancelScheduledTask();
    disposeEffect?.();
    disposeEffect = null;
  }) as Cleanup;

  dispose.dispose = dispose;
  return dispose;
}
