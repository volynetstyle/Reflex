import { assertHookUsage } from "./context";
import { useEffectInternal, useEffectOnceInternal } from "./useEffectCore";

/**
 * Registers an action to run once when the current owner mounts.
 *
 * @remarks
 * **When to use:** for a simple mount callback without reactive dependencies.
 * **When not to use:** when the first run must wait for DOM and reactive work to
 * settle; use a mounted effect. Use `useEffect` for reactive reruns.
 *
 * @param callback The action to run on mount.
 */
export function useMount(callback: () => void): void {
  assertHookUsage("useMount");
  void useEffectOnceInternal(() => {
    callback();
  });
}

/**
 * Registers a callback to run when the current component owner is disposed.
 *
 * @remarks
 * **When to use:** for a simple unmount action such as notifying an external
 * system; `useOwned` is more convenient for disposing a specific resource.
 * **When not to use:** for reactive updates or mount initialization.
 *
 * @param callback The action to run on disposal.
 */
export function useUnmount(callback: () => void): void {
  assertHookUsage("useComponentDidUnmount");
  void useEffectInternal(() => callback);
}
