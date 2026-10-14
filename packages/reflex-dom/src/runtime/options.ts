import {
  createExecutionDomain,
  type ExecutionDomain,
  type RuntimeContext,
  type RuntimeHostHooks,
} from "@volynets/reflex-runtime/internal";
import type { MountEffects } from "./mount-effects";
import {
  cleanupQueuedNodesAfterAbort,
  createRuntimeSchedulerBinding,
  resolveEffectSchedulerMode,
  type EffectStrategy,
} from "@volynets/reflex-scheduler";
import { createDOMSchedulerCoordinator } from "./scheduler/coordinator";
import { createPromiseMicrotaskCarrier } from "./scheduler/host-carrier";

export interface RuntimeInstance {
  readonly execution: RuntimeContext;
  /** The isolated execution domain backing this renderer runtime. */
  readonly domain: ExecutionDomain;
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
  const strategy = options.effectStrategy ?? "eager";

  // The coordinator is this domain's scheduler: invalidations, microtask
  // resume, batches and flushes all execute inside the domain (S1).
  const domain = createExecutionDomain({
    hooks: options.hooks,
    scheduler(context) {
      const scheduler = createRuntimeSchedulerBinding(
        resolveEffectSchedulerMode(strategy),
        context,
      );
      const coordinator = createDOMSchedulerCoordinator(
        scheduler,
        mountEffects,
        createPromiseMicrotaskCarrier(),
        (fn) => domain.run(fn),
      );
      return {
        onNodeInvalidated: coordinator.onNodeInvalidated,
        onRuntimeIdle: coordinator.onRuntimeIdle,
        onHostFlush: scheduler.onHostFlush,
        batch: coordinator.batch,
        flush: coordinator.flush,
        hasPending: scheduler.hasPending,
        release() {
          coordinator.cancel();
          cleanupQueuedNodesAfterAbort(scheduler.core.queue);
        },
      };
    },
  });

  return {
    execution: domain.context,
    domain,
    run: domain.run,
    batch: domain.batch,
    flush: domain.flush,
  };
}
