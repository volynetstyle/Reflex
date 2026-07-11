import {} from "@volynets/reflex-runtime/internal";
import { EffectSchedulerMode } from "../scheduler.constants";
import { hasPendingEffects, isContextSettled } from "../scheduler.context";
import {
  createSchedulerCore,
  enterSchedulerBatch,
  flushSchedulerQueue,
  leaveSchedulerBatch,
} from "../scheduler.core";
import { tryEnqueue } from "../scheduler.enqueue";
import { createSchedulerInstance } from "../scheduler.instance";
import type { EffectScheduler } from "../scheduler.types";
import { noopNotifySettled } from "../scheduler.types";
import type { ReactiveNode } from "@volynets/reflex-runtime/internal";
import { profileSchedulerPolicyCounter } from "../scheduler.counters";

export function createSabScheduler(): EffectScheduler {
  const core = createSchedulerCore();
  const enqueue = (node: ReactiveNode): void => {
    tryEnqueue(core.queue, node);
  };
  const batch = <T>(fn: () => T): T => {
    enterSchedulerBatch(core);
    try {
      return fn();
    } finally {
      profileSchedulerPolicyCounter("batchExit");

      if (
        leaveSchedulerBatch(core) &&
        hasPendingEffects(core) &&
        isContextSettled()
      ) {
        flushSchedulerQueue(core);
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
