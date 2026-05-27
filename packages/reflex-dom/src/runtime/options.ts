import { createRuntime } from "@volynets/reflex";
import { registerActiveOwnerCleanup } from "@volynets/reflex-framework";
import type { DOMRenderEffectScheduler } from "./render-effect-scheduler";
import {
  createDefaultPolicyConfig,
  resolveEffectStrategy,
  type PolicyConfig,
} from "./policies";

export type RuntimeInstance = ReturnType<typeof createRuntime>;

type CreateRuntimeOptions = NonNullable<Parameters<typeof createRuntime>[0]>;

export interface DOMRuntimeOptions extends CreateRuntimeOptions {
  policy?: Partial<PolicyConfig>;
}

export function createRendererRuntime(
  options: DOMRuntimeOptions = {},
  renderEffectScheduler?: DOMRenderEffectScheduler,
): RuntimeInstance {
  const { policy, hooks, effectStrategy, ...runtimeOptions } = options;

  const defaultPolicy = createDefaultPolicyConfig();

  const resolvedEffectStrategy =
    effectStrategy ??
    resolveEffectStrategy(
      policy?.effectPolicy ?? defaultPolicy.effectPolicy,
      policy?.priorityLevels ?? defaultPolicy.priorityLevels,
    );

  return createRuntime({
    ...runtimeOptions,

    effectStrategy: resolvedEffectStrategy,

    hooks: {
      ...hooks,

      reactiveSettledDispatcher() {
        renderEffectScheduler?.flush();
        hooks?.reactiveSettledDispatcher?.();
      },

      effectCleanupRegistrar(dispose) {
        registerActiveOwnerCleanup(dispose);
        hooks?.effectCleanupRegistrar?.(dispose);
      },
    },
  });
}
