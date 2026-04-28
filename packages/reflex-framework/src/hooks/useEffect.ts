import { assertHookUsage } from "./context";
import {
  type EffectCallback,
  type EffectCleanup,
  useEffectInternal,
  useEffectOnceInternal,
  useEffectRenderInternal,
} from "./useEffectCore";

export type { EffectCallback, EffectCleanup };

export function useEffect(callback: EffectCallback): EffectCleanup {
  assertHookUsage("useEffect");
  return useEffectInternal(callback);
}

export function useEffectOnce(callback: () => void): void {
  assertHookUsage("useEffectOnce");
  void useEffectOnceInternal(callback);
}

export function useEffectRender(callback: EffectCallback): EffectCleanup {
  assertHookUsage("useEffectRender");
  return useEffectRenderInternal(callback);
}
