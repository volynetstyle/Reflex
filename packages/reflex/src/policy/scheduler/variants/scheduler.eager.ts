import type { ExecutionContext, ReactiveNode } from "@reflex/runtime";
import { EffectSchedulerMode } from "../scheduler.constants";
import {
  createSchedulerCore,
  isRuntimeInactive,
  createSchedulerInstance,
  tryEnqueue,
} from "../scheduler.core";
import type { EffectScheduler } from "../scheduler.types";

export function createEagerScheduler(
  context: ExecutionContext,
): EffectScheduler {
  const core = createSchedulerCore();
  const notifySettled = (): void => {
    if (isRuntimeInactive(core) && core.queue.size !== 0) {
      core.flush();
    }
  };
  const enqueue = (node: ReactiveNode): void => {
    if (!tryEnqueue(core.queue, node)) return;
    if (isRuntimeInactive(core)) core.flush();
  };
  const batch = <T>(fn: () => T): T => {
    core.enterBatch();
    try {
      return fn();
    } finally {
      if (core.leaveBatch() && core.queue.size !== 0) {
        core.flush();
      }
    }
  };

  return createSchedulerInstance(
    EffectSchedulerMode.Eager,
    context,
    core,
    enqueue,
    batch,
    notifySettled,
    notifySettled,
  );
}
