import type { ExecutionContext } from "@reflex/runtime";
import { EffectSchedulerMode } from "../scheduler.constants";
import {
  createSchedulerCore,
  createSchedulerInstance,
  isContextSettled,
  tryEnqueue,
} from "../scheduler.core";
import type { EffectScheduler } from "../scheduler.types";
import { noopNotifySettled } from "../scheduler.types";

export function createSabScheduler(context: ExecutionContext): EffectScheduler {
  const core = createSchedulerCore();
  const queue = core.queue;

  return createSchedulerInstance(
    EffectSchedulerMode.SAB,
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
        if (
          core.leaveBatch() &&
          queue.size !== 0 &&
          isContextSettled(context)
        ) {
          core.flush();
        }
      }
    },
    noopNotifySettled,
    undefined,
  );
}
