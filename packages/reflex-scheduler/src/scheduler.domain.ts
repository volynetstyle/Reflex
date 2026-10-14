import {
  createExecutionDomain,
  type ExecutionDomain,
  type ExecutionDomainOptions,
} from "@volynets/reflex-runtime/internal";

import {
  createRuntimeSchedulerBinding,
  type RuntimeSchedulerBinding,
} from "./scheduler.binding";
import { cleanupQueuedNodesAfterAbort } from "./scheduler.flush";
import {
  resolveEffectSchedulerMode,
  type EffectStrategy,
} from "./scheduler.infra";

export interface SchedulerDomainOptions extends Omit<
  ExecutionDomainOptions,
  "scheduler"
> {
  effectStrategy?: EffectStrategy;
}

export interface SchedulerDomain {
  readonly domain: ExecutionDomain;
  readonly scheduler: RuntimeSchedulerBinding;
}

/**
 * Creates an execution domain with its own effect scheduler (S1): the
 * scheduler's queue only receives this domain's invalidations, and every
 * flush runs inside this domain.
 */
export function createSchedulerDomain(
  options: SchedulerDomainOptions = {},
): SchedulerDomain {
  const { effectStrategy, ...domainOptions } = options;
  let scheduler!: RuntimeSchedulerBinding;

  const domain = createExecutionDomain({
    ...domainOptions,
    scheduler(context) {
      scheduler = createRuntimeSchedulerBinding(
        resolveEffectSchedulerMode(effectStrategy),
        context,
      );
      return {
        onNodeInvalidated: scheduler.onNodeInvalidated,
        onHostFlush: scheduler.onHostFlush,
        enterBatch: scheduler.enterBatch,
        leaveBatch: scheduler.leaveBatch,
        flush: scheduler.flush,
        hasPending: scheduler.hasPending,
        release: () => cleanupQueuedNodesAfterAbort(scheduler.core.queue),
      };
    },
  });

  return { domain, scheduler };
}
