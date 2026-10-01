import { assertHookUsage } from "./context";
import {
  type EffectCallback,
  type EffectCleanup,
  useEffectInternal,
  useEffectOnceInternal,
} from "./useEffectCore";

export type { EffectCallback, EffectCleanup };

/**
 * Runs a reactive effect again when values read by the effect change. Cleanup
 * from the previous run executes before the next run and when its owner closes.
 *
 * @remarks
 * **When to use:** to synchronize with external systems, manage subscriptions,
 * or perform other side effects based on reactive values.
 * **When not to use:** to derive a value for rendering; use `useComputed`.
 *
 * @param callback The effect; a returned function cleans up that run.
 */
export function useEffect(callback: EffectCallback): EffectCleanup {
  assertHookUsage("useEffect");
  return useEffectInternal(callback);
}

/**
 * Runs a callback once during the owner's lifetime and disposes it with that owner.
 *
 * @remarks
 * **When to use:** for one-time initialization or registration without reactive
 * reruns.
 * **When not to use:** for effects that react to changing dependencies; use
 * `useEffect`.
 *
 * @param callback The one-time action; it does not return a cleanup function.
 */
export function useEffectOnce(callback: () => void): void {
  assertHookUsage("useEffectOnce");
  void useEffectOnceInternal(callback);
}
