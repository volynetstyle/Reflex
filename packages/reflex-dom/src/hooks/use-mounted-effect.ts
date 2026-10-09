import {
  assertHookUsage,
  createOwnedEffect,
  getCurrentHookNode,
  getCurrentHookOwner,
  registerCleanup,
  type Cleanup,
  type EffectCallback,
  type EffectCleanup,
} from "@volynets/reflex-framework";
import { getDOMContext, withDOMContext } from "../runtime/context";

/**
 * Defers the first reactive effect run until mounting and pending DOM work settle.
 * Subsequent runs use ordinary effect delivery; the callback belongs to the owner.
 *
 * @remarks
 * **When to use:** for initial synchronization with mounted DOM, such as
 * measuring an element or setting up a DOM-dependent integration.
 * **When not to use:** as a browser paint/layout phase or animation-frame
 * callback; the mount queue does not promise when the browser paints.
 *
 * @param callback The reactive effect; its cleanup runs on rerun or disposal.
 */
export function useMountedEffect(callback: EffectCallback): EffectCleanup {
  assertHookUsage("useMountedEffect");

  const context = getDOMContext();
  const scheduler = context.mountEffects;
  const owner = getCurrentHookOwner();
  const node = getCurrentHookNode();

  let disposed = false;
  let disposeEffect: Cleanup | null = null;

  const cancelScheduledTask = scheduler.schedule(() => {
    if (disposed) return;
    const effect = createOwnedEffect(owner, node, () =>
      withDOMContext(context, callback),
    );
    if (disposed) effect();
    else disposeEffect = effect;
  });

  const dispose = (() => {
    if (disposed) return;
    disposed = true;
    cancelScheduledTask();
    disposeEffect?.();
    disposeEffect = null;
  }) as Cleanup;

  dispose.dispose = dispose;
  // A component can disappear before the queue reaches its first effect.
  registerCleanup(owner, dispose);
  return dispose;
}
