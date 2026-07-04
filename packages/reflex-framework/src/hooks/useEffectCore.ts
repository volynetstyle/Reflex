import type { Cleanup } from "../types/core";
import { createOwnedEffect } from "../reactivity/owned-effect";
import { runWithOwner } from "../ownership/ownership.scope";
import {
  RenderEffectPhase,
  getCurrentHookOwner,
  getCurrentHookNode,
  getCurrentRenderEffectScheduler,
} from "./context";

export type EffectCleanup = void | Cleanup;
export type EffectCallback = () => EffectCleanup;

export function useEffectInternal(callback: EffectCallback): Cleanup {
  const owner = getCurrentHookOwner();
  return createOwnedEffect(owner, owner.currentNode, callback);
}

export function useEffectOnceInternal(callback: () => void): void {
  let didRun = false;

  const owner = getCurrentHookOwner();
  const dispose = createOwnedEffect(owner, owner.currentNode, () => {
    if (didRun) {
      return;
    }

    didRun = true;
    callback();
  });

  if (didRun) {
    dispose();
  }
}

export function useEffectRenderInternal(callback: EffectCallback): Cleanup {
  const scheduler = getCurrentRenderEffectScheduler();
  const owner = getCurrentHookOwner();
  const node = getCurrentHookNode();

  let disposed = false;
  let disposeEffect: Cleanup | null = null;

  const cancelableScheduledTask = scheduler.schedule(() => {
    if (disposed) return;

    disposeEffect = runWithOwner(owner, node, () =>
      createOwnedEffect(owner, node, callback),
    );

    if (disposed) {
      disposeEffect();
      disposeEffect = null;
    }
  }, RenderEffectPhase.Render);

  const dispose = (() => {
    disposed = true;
    cancelableScheduledTask();
    disposeEffect?.();
    disposeEffect = null;
  }) as Cleanup;

  dispose.dispose = dispose;
  return dispose;
}
