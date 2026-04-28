import { assertHookUsage } from "./context";
import {
  type EffectCallback,
  type EffectCleanup,
  useEffectInternal,
  useEffectOnceInternal,
  useEffectRenderInternal,
} from "./useEffectCore";

export type { EffectCallback, EffectCleanup };

export function useEffect(callback: EffectCallback): void {
  assertHookUsage("useEffect");
  void useEffectInternal(callback);
}

export function useEffectOnce(callback: () => void): void {
  assertHookUsage("useEffectOnce");
  void useEffectOnceInternal(callback);
}

export function useEffectRender(callback: EffectCallback): void {
  assertHookUsage("useEffectRender");
  void useEffectRenderInternal(callback);
}
