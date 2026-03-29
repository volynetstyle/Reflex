import { createRuntime } from "@volynetstyle/reflex";
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
): RuntimeInstance {
  const { policy, ...runtimeOptions } = options ?? {};
  const mergedPolicy = {
    ...createDefaultPolicyConfig(),
    ...policy,
  };

  return createRuntime({
    effectStrategy:
      runtimeOptions.effectStrategy ??
      resolveEffectStrategy(mergedPolicy.effectPolicy),
    ...runtimeOptions,
  });
}
