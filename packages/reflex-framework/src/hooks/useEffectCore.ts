import type { Cleanup } from "../types/core";
import { useOwnedEffect } from "../ownership/effects";
import { runWithOwner } from "../ownership/ownership.scope";
import {
  RenderEffectPhase,
  getCurrentHookOwner,
  getCurrentHookScope,
  getCurrentRenderEffectScheduler,
} from "./context";

export type EffectCleanup = void | Cleanup;
export type EffectCallback = () => EffectCleanup;

export function useEffectInternal(callback: EffectCallback): Cleanup {
  return useOwnedEffect({ owner: getCurrentHookOwner() }, callback);
}

export function useEffectOnceInternal(callback: () => void): void {
  let didRun = false;

  const dispose = useEffectInternal(() => {
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
  const scope = getCurrentHookScope();

  let disposed = false;
  let disposeEffect: Cleanup | null = null;

  const cancelableScheduledTask = scheduler.schedule(
    () => {
      if (disposed) return;

      disposeEffect = runWithOwner(owner, scope, () =>
        useOwnedEffect({ owner }, callback),
      );

      if (disposed) {
        disposeEffect();
        disposeEffect = null;
      }
    },
    RenderEffectPhase.Render,
  );

  const dispose = (() => {
    disposed = true;
    cancelableScheduledTask();
    disposeEffect?.();
    disposeEffect = null;
  }) as Cleanup;

  dispose.dispose = dispose;
  return dispose;
}
