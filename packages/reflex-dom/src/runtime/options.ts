import { createRuntime } from "@volynets/reflex";
import type { DOMRenderEffectScheduler } from "./render-effect-scheduler";
import {
  createDefaultPolicyConfig,
  resolveEffectStrategy,
  type PolicyConfig,
} from "./policies";

export type RuntimeInstance = ReturnType<typeof createRuntime>;

type BaseDOMRuntimeOptions = NonNullable<Parameters<typeof createRuntime>[0]>;

export interface DOMRuntimeOptions extends BaseDOMRuntimeOptions {
  policy?: Partial<PolicyConfig>;
}

export function createRendererRuntime(
  options?: DOMRuntimeOptions,
  renderEffectScheduler?: DOMRenderEffectScheduler,
): RuntimeInstance {
  const { policy, hooks, ...runtimeOptions } = options ?? {};
  const mergedPolicy = {
    ...createDefaultPolicyConfig(),
    ...policy,
  };

  return createRuntime({
    effectStrategy:
      runtimeOptions.effectStrategy ??
      resolveEffectStrategy(mergedPolicy.effectPolicy),
    hooks: {
      ...hooks,
      onReactiveSettled() {
        renderEffectScheduler?.flush();
        hooks?.onReactiveSettled?.();
      },
    },
    ...runtimeOptions,
  });
}
