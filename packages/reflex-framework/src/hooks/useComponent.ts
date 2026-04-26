import { assertHookUsage } from "./context";
import { useEffectInternal, useEffectOnceInternal } from "./useEffectCore";

export function useComponentDidMount(callback: () => void): void {
  assertHookUsage("useComponentDidMount");
  useEffectOnceInternal(() => {
    callback();
  });
}

export function useComponentDidUnmount(callback: () => void): void {
  assertHookUsage("useComponentDidUnmount");
  useEffectInternal(() => callback);
}
