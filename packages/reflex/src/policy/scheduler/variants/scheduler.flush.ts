import type { ReactiveNode } from "@volynets/reflex-runtime";
import { EffectSchedulerMode } from "../scheduler.constants";
import { createSchedulerCore } from "../scheduler.core";
import { tryEnqueue } from "../scheduler.enqueue";
import { createSchedulerInstance } from "../scheduler.instance";
import type { EffectScheduler } from "../scheduler.types";
import { noopNotifySettled } from "../scheduler.types";

export function createFlushScheduler(): EffectScheduler {
  return createQueueFlushScheduler(EffectSchedulerMode.Flush, false);
}

export function createRankedScheduler(): EffectScheduler {
  return createQueueFlushScheduler(EffectSchedulerMode.Ranked, true);
}

function createQueueFlushScheduler(
  mode: EffectSchedulerMode,
  priority: boolean,
): EffectScheduler {
  const core = createSchedulerCore(priority);
  const enqueue = (node: ReactiveNode): void => {
    tryEnqueue(core.queue, node);
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
    mode,
    core,
    enqueue,
    batch,
    noopNotifySettled,
    undefined,
  );
}
