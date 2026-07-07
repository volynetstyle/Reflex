import { assertHookUsage } from "./context";
import { useEffectInternal, useEffectOnceInternal } from "./useEffectCore";

export function useMount(callback: () => void): void {
  assertHookUsage("useMount");
  void useEffectOnceInternal(() => {
    callback();
  });
}

export function useUnmount(callback: () => void): void {
  assertHookUsage("useComponentDidUnmount");
  void useEffectInternal(() => callback);
}
