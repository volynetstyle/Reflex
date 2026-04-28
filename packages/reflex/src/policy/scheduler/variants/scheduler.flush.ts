import type { ReactiveNode } from "@volynets/reflex-runtime";
import { EffectSchedulerMode } from "../scheduler.constants";
import {
  createSchedulerCore,
  createSchedulerInstance,
  tryEnqueueEffect,
} from "../scheduler.core";
import { flushPrioritySchedulerQueue } from "../scheduler.priority";
import type { EffectScheduler } from "../scheduler.types";
import { noopNotifySettled } from "../scheduler.types";

export function createFlushScheduler(): EffectScheduler {
  const core = createSchedulerCore();
  core.flush = (): void => flushPrioritySchedulerQueue(core);
  const enqueue = (node: ReactiveNode): void => {
    tryEnqueueEffect(core, node);
  };
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
    core,
    enqueue,
    batch,
    noopNotifySettled,
    undefined,
  );
}
