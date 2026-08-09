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
import { resolveEffectStrategy, type PolicyConfig } from "./policies";

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
  const strategy =
    options.effectStrategy ??
    resolveEffectStrategy(policy?.effectPolicy, policy?.priorityLevels);
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
  const externalRuntimeIdle = hooks?.onRuntimeIdle;
  const onRuntimeIdle =
    externalRuntimeIdle === undefined
      ? (): void => {
          runtimeIdle = true;
        }
      : (): void => {
          runtimeIdle = true;
          externalRuntimeIdle();
        };

  const run = <T>(fn: () => T): T => {
    if (getActiveRuntimeContext() === execution) return fn();
    return runWithRuntimeContext(execution, fn);
  };

  const flushRenderEffects = (): void => {
    if (!runtimeIdle) return;
    runtimeIdle = false;
    renderEffectScheduler?.flush();
  };

  const flushWithinRuntime = (): void => {
    scheduler.flush();
    flushRenderEffects();
  };
  const flush = (): void => run(flushWithinRuntime);

  const flushScheduledMicrotask = (): void => {
    microtaskPending = false;
    flush();
  };

  const scheduleMicrotaskFlush = (): void => {
    if (microtaskPending) return;
    microtaskPending = true;
    void Promise.resolve().then(flushScheduledMicrotask);
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
      onRuntimeIdle,
    },
    scheduler: {
      onHostFlush: scheduler.onHostFlush,
    },
  });

  return { execution, run, batch, flush };
}
