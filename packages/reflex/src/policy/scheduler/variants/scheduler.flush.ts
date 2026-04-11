import type { ExecutionContext } from "@reflex/runtime";
import { EffectSchedulerMode } from "../scheduler.constants";
import {
  createSchedulerCore,
  createSchedulerInstance,
  tryEnqueue,
} from "../scheduler.core";
import type { EffectScheduler } from "../scheduler.types";
import { noopNotifySettled } from "../scheduler.types";

export function createFlushScheduler(
  context: ExecutionContext,
): EffectScheduler {
  const core = createSchedulerCore();
  const queue = core.queue;
  const enqueue = tryEnqueue.bind(null, queue);
  const batch = <T>(fn: () => T): T => {
    core.enterBatch();
    try {
      return fn();
    } finally {
      core.leaveBatch();
    }
  };
  
  return createSchedulerInstance(
    EffectSchedulerMode.Flush,
    context,
    core,
    enqueue,
    batch,
    noopNotifySettled,
    undefined,
  );
}
