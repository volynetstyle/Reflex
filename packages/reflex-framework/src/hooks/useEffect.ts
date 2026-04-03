import { effect } from "@volynets/reflex";
import type { Cleanup } from "../types/core";

export type EffectCleanup = void | Cleanup;
export type EffectCallback = () => EffectCleanup;

export function useEffect(callback: EffectCallback): Cleanup {
  return effect(callback);
}

export function useEffectOnce(callback: () => void): void {
  let didRun = false;

  const dispose = effect(() => {
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

export function useEffectRender(callback: EffectCallback): Cleanup {
  return useEffect(callback);
}
