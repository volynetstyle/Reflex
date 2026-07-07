import type { Cleanup } from "../types/core";
import { createOwnedEffect } from "../reactivity/owned-effect";
import { getCurrentHookOwner, getCurrentHookNode } from "./context";

export type EffectCleanup = void | Cleanup;
export type EffectCallback = () => EffectCleanup;

export function useEffectInternal(callback: EffectCallback): Cleanup {
  const owner = getCurrentHookOwner();
  const node = getCurrentHookNode();

  return createOwnedEffect(owner, node, callback);
}

export function useEffectOnceInternal(callback: () => void): Cleanup {
  const owner = getCurrentHookOwner();
  const node = getCurrentHookNode();

  let didRun = false;
  let disposed = false;
  let disposeEffect: Cleanup | null = null;

  disposeEffect = createOwnedEffect(owner, node, () => {
    if (disposed || didRun) {
      return;
    }

    didRun = true;
    callback();
  });

  const dispose = (() => {
    if (disposed) {
      return;
    }

    disposed = true;

    const effect = disposeEffect;
    disposeEffect = null;

    effect?.();
  }) as Cleanup;

  dispose.dispose = dispose;

  if (didRun) {
    dispose();
  }

  return dispose;
}

