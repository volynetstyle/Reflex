import type { Cleanup } from "../types/core";
import { assertHookUsage } from "./context";
import {
  type EffectCallback,
  type EffectCleanup,
  useEffectInternal,
  useEffectOnceInternal,
  useEffectRenderInternal,
} from "./useEffectCore";

export type { EffectCallback, EffectCleanup };

export function useEffect(callback: EffectCallback): Cleanup {
  assertHookUsage("useEffect");
  return useEffectInternal(callback);
}

export function useEffectOnce(callback: () => void): void {
  assertHookUsage("useEffectOnce");
  useEffectOnceInternal(callback);
}

export function useEffectRender(callback: EffectCallback): Cleanup {
  assertHookUsage("useEffectRender");
  return useEffectRenderInternal(callback);
}
