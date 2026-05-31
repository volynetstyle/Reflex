import type { ReactiveNode } from "@volynets/reflex-runtime/internal";
import { EffectSchedulerMode } from "../scheduler.constants";
import {
  createSchedulerCore,
  enterSchedulerBatch,
  leaveSchedulerBatch,
} from "../scheduler.core";
import { tryEnqueue } from "../scheduler.enqueue";
import { createSchedulerInstance } from "../scheduler.instance";
import type { EffectScheduler } from "../scheduler.types";
import { noopNotifySettled } from "../scheduler.types";

export function createFlushScheduler(): EffectScheduler {
  const core = createSchedulerCore();
  const enqueue = (node: ReactiveNode): void => {
    tryEnqueue(core.queue, node);
  };
  const batch = <T>(fn: () => T): T => {
    enterSchedulerBatch(core);
    try {
      return fn();
    } finally {
      leaveSchedulerBatch(core);
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
