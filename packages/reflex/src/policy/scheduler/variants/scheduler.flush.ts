import type { ExecutionContext } from "@reflex/runtime";
import { EffectSchedulerMode } from "../scheduler.constants";
import { createSchedulerCore, createSchedulerInstance, tryEnqueue } from "../scheduler.core";
import type { EffectScheduler} from "../scheduler.types";
import { noopNotifySettled } from "../scheduler.types";

export function createFlushScheduler(
  context: ExecutionContext,
): EffectScheduler {
  const core = createSchedulerCore();
  const queue = core.queue;

  return createSchedulerInstance(
    EffectSchedulerMode.Flush,
    context,
    core,
    (node) => {
      tryEnqueue(queue, node);
    },
    <T>(fn: () => T): T => {
      core.enterBatch();
      try {
        return fn();
      } finally {
        core.leaveBatch();
      }
    },
    noopNotifySettled,
    undefined,
  );
}
