import {
  configureRuntimeContext,
  createRuntimeContext,
  enterReactiveBatch,
  getActiveRuntimeContext,
  leaveReactiveBatch,
  runWithRuntimeContext,
  type RuntimeContext,
  type RuntimeHostHooks,
} from "@volynets/reflex-runtime/internal";
import type { DOMRenderEffectScheduler } from "./render-effect-scheduler";
import {
  createEffectScheduler,
  resolveEffectSchedulerMode,
  type EffectStrategy,
} from "@volynets/reflex-scheduler";
import {
  createDefaultPolicyConfig,
  resolveEffectStrategy,
  type PolicyConfig,
} from "./policies";

export interface RuntimeInstance {
  readonly execution: RuntimeContext;
  run<T>(fn: () => T): T;
  batch<T>(fn: () => T): T;
  flush(): void;
}

export interface DOMRuntimeOptions {
  policy?: Partial<PolicyConfig>;
  effectStrategy?: EffectStrategy;
  hooks?: RuntimeHostHooks;
}

export function createRendererRuntime(
  options: DOMRuntimeOptions = {},
  renderEffectScheduler?: DOMRenderEffectScheduler,
): RuntimeInstance {
  const { policy, hooks } = options;
  const defaults = createDefaultPolicyConfig();
  const strategy =
    options.effectStrategy ??
    resolveEffectStrategy(
      policy?.effectPolicy ?? defaults.effectPolicy,
      policy?.priorityLevels ?? defaults.priorityLevels,
    );
  const scheduler = createEffectScheduler(resolveEffectSchedulerMode(strategy));
  const execution = createRuntimeContext();
  let reactiveSettled = false;
  let microtaskPending = false;

  const run = <T>(fn: () => T): T => {
    if (getActiveRuntimeContext() === execution) return fn();
    return runWithRuntimeContext(execution, fn);
  };

  const flushRenderEffects = (): void => {
    if (!reactiveSettled) return;
    reactiveSettled = false;
    renderEffectScheduler?.flush();
  };

  const flush = (): void => {
    run(() => {
      scheduler.flush();
      flushRenderEffects();
    });
  };

  const scheduleMicrotaskFlush = (): void => {
    if (microtaskPending) return;
    microtaskPending = true;
    void Promise.resolve().then(() => {
      microtaskPending = false;
      flush();
    });
  };

  const batch = <T>(fn: () => T): T =>
    run(() => {
      enterReactiveBatch();
      try {
        return scheduler.batch(fn);
      } finally {
        leaveReactiveBatch();
        if (strategy === "flush") scheduleMicrotaskFlush();
        else flushRenderEffects();
      }
    });

  configureRuntimeContext(execution, {
    hooks: {
      sinkInvalidatedDispatcher(node) {
        scheduler.enqueue(node);
        hooks?.sinkInvalidatedDispatcher?.(node);
      },
      reactiveSettledDispatcher() {
        reactiveSettled = true;
        scheduler.runtimeNotifySettled?.();
        hooks?.reactiveSettledDispatcher?.();
      },
    },
  });

  return { execution, run, batch, flush };
}
