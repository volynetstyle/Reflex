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
  createRuntimeSchedulerBinding,
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
  const execution = createRuntimeContext();
  const scheduler = createRuntimeSchedulerBinding(
    resolveEffectSchedulerMode(strategy),
    execution,
  );
  const externalNodeInvalidated = hooks?.onNodeInvalidated;
  const onNodeInvalidated =
    externalNodeInvalidated === undefined
      ? scheduler.onNodeInvalidated
      : (node: Parameters<typeof scheduler.onNodeInvalidated>[0]): void => {
          scheduler.onNodeInvalidated(node);
          externalNodeInvalidated(node);
        };
  let runtimeIdle = false;
  let microtaskPending = false;

  const run = <T>(fn: () => T): T => {
    if (getActiveRuntimeContext() === execution) return fn();
    return runWithRuntimeContext(execution, fn);
  };

  const flushRenderEffects = (): void => {
    if (!runtimeIdle) return;
    runtimeIdle = false;
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
      onNodeInvalidated,
      onRuntimeIdle() {
        runtimeIdle = true;
        hooks?.onRuntimeIdle?.();
      },
    },
    scheduler: {
      onHostFlush: scheduler.onHostFlush,
    },
  });

  return { execution, run, batch, flush };
}
