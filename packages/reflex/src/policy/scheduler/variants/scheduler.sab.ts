import type { ReactiveNode } from "@volynets/reflex-runtime";
import { EffectSchedulerMode } from "../scheduler.constants";
import {
  createSchedulerCore,
  createSchedulerInstance,
  isContextSettled,
  tryEnqueue,
} from "../scheduler.core";
import type { EffectScheduler } from "../scheduler.types";
import { noopNotifySettled } from "../scheduler.types";

export function createSabScheduler(): EffectScheduler {
  const core = createSchedulerCore();
  const enqueue = (node: ReactiveNode): void => {
    tryEnqueue(core.queue, node);
  };
  const batch = <T>(fn: () => T): T => {
    core.enterBatch();
    try {
      return fn();
    } finally {
      if (core.leaveBatch() && core.queue.size !== 0 && isContextSettled()) {
        core.flush();
      }
    }
  };

  return createSchedulerInstance(
    EffectSchedulerMode.SAB,
    core,
    enqueue,
    batch,
    noopNotifySettled,
    undefined,
  );
}
