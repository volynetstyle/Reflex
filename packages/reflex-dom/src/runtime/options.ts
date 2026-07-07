import {
  createRuntimeContext,
  enterReactiveBatch,
  flushPendingReactiveSettledIfIdle,
  hasPendingReactiveSettled,
  leaveReactiveBatch,
  runWithRuntimeContext,
  type RuntimeContext,
  type RuntimeContextOptions,
} from "@volynets/reflex-runtime/internal";
import type { DOMRenderEffectScheduler } from "./render-effect-scheduler";
import {
  createDefaultPolicyConfig,
  resolveEffectStrategy,
  type PolicyConfig,
} from "./policies";

export interface RuntimeInstance {
  readonly execution: RuntimeContext;
  batch<T>(fn: () => T): T;
}

export interface DOMRuntimeOptions extends RuntimeContextOptions {
  policy?: Partial<PolicyConfig>;
}

export function createRendererRuntime(
  options: DOMRuntimeOptions = {},
  renderEffectScheduler?: DOMRenderEffectScheduler,
): RuntimeInstance {
  const { policy, hooks, ...runtimeOptions } = options;

  const defaultPolicy = createDefaultPolicyConfig();

  resolveEffectStrategy(
    policy?.effectPolicy ?? defaultPolicy.effectPolicy,
    policy?.priorityLevels ?? defaultPolicy.priorityLevels,
  );

  const execution = createRuntimeContext({
    ...runtimeOptions,
    hooks: {
      ...hooks,

      reactiveSettledDispatcher() {
        renderEffectScheduler?.flush();
        hooks?.reactiveSettledDispatcher?.();
      },
    },
  });

  return {
    execution,
    batch<T>(fn: () => T): T {
      return runWithRuntimeContext(execution, () => {
        enterReactiveBatch();
        try {
          return fn();
        } finally {
          leaveReactiveBatch();
          if (hasPendingReactiveSettled()) {
            flushPendingReactiveSettledIfIdle();
          }
        }
      });
    },
  };
}
