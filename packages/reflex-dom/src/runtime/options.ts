import {
  configureRuntimeContext,
  createRuntimeContext,
  getActiveRuntimeContext,
  runWithRuntimeContext,
  type RuntimeContext,
  type RuntimeHostHooks,
} from "@volynets/reflex-runtime/internal";
import type { MountEffects } from "./mount-effects";
import {
  createRuntimeSchedulerBinding,
  resolveEffectSchedulerMode,
  type EffectStrategy,
} from "@volynets/reflex-scheduler";
import { createDOMSchedulerCoordinator } from "./scheduler/coordinator";
import { createPromiseMicrotaskCarrier } from "./scheduler/host-carrier";

export interface RuntimeInstance {
  readonly execution: RuntimeContext;
  run<T>(fn: () => T): T;
  batch<T>(fn: () => T): T;
  flush(): void;
}

/**
 * Options for configuring a DOM runtime.
 *
 * @remarks
 * `effectStrategy` selects eager, settled batch-boundary (`sab`), or microtask
 * (`flush`) effect delivery. `hooks` adds host callbacks alongside renderer
 * notifications. These options apply to the application's runtime, not to one
 * render call or browser paint.
 */
export interface DOMRuntimeOptions {
  /** Eager, settled batch-boundary (`sab`), or Promise-microtask (`flush`) effect delivery. */
  effectStrategy?: EffectStrategy;
  /** Additional host callbacks, composed with renderer runtime notifications. */
  hooks?: RuntimeHostHooks;
}

export function createRendererRuntime(
  options: DOMRuntimeOptions = {},
  mountEffects?: MountEffects,
): RuntimeInstance {
  const { hooks } = options;
  const strategy = options.effectStrategy ?? "eager";
  const execution = createRuntimeContext();
  const scheduler = createRuntimeSchedulerBinding(
    resolveEffectSchedulerMode(strategy),
    execution,
  );
  const run = <T>(fn: () => T): T => {
    if (getActiveRuntimeContext() === execution) return fn();
    return runWithRuntimeContext(execution, fn);
  };

  const coordinator = createDOMSchedulerCoordinator(
    scheduler,
    mountEffects,
    createPromiseMicrotaskCarrier(),
    run,
  );
  const externalNodeInvalidated = hooks?.onNodeInvalidated;
  const onNodeInvalidated =
    externalNodeInvalidated === undefined
      ? coordinator.onNodeInvalidated
      : (node: Parameters<typeof coordinator.onNodeInvalidated>[0]): void => {
          coordinator.onNodeInvalidated(node);
          externalNodeInvalidated(node);
        };
  const externalRuntimeIdle = hooks?.onRuntimeIdle;
  const onRuntimeIdle =
    externalRuntimeIdle === undefined
      ? coordinator.onRuntimeIdle
      : (): void => {
          coordinator.onRuntimeIdle();
          externalRuntimeIdle();
        };

  configureRuntimeContext(execution, {
    hooks: {
      onNodeInvalidated,
      onRuntimeIdle,
    },
    scheduler: {
      onHostFlush: scheduler.onHostFlush,
    },
  });

  return {
    execution,
    run,
    batch: coordinator.batch,
    flush: coordinator.flush,
  };
}
