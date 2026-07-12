import { EffectSchedulerMode } from "../scheduler.constants";
import { hasPendingEffects, isContextSettled } from "../scheduler.context";
import {
  createSchedulerCore,
  enterSchedulerBatch,
  flushPendingSchedulerQueue,
  flushSchedulerQueue,
  leaveSchedulerBatch,
} from "../scheduler.core";
import { tryEnqueue } from "../scheduler.enqueue";
import { createSchedulerInstance } from "../scheduler.instance";
import type { EffectScheduler } from "../scheduler.types";
import { noopNotifySettled } from "../scheduler.types";
import type { ReactiveNode } from "@volynets/reflex-runtime/internal";
import { profileSchedulerPolicyCounter } from "../scheduler.counters";

const SCHEDULER_PROFILE_ENABLED =
  typeof __PROFILE__ !== "undefined" && __PROFILE__;

export function createSabScheduler(): EffectScheduler {
  const core = createSchedulerCore();
  const queue = core.queue;
  const enqueue = (node: ReactiveNode): void => {
    tryEnqueue(queue, node);
  };
  const batch = <T>(fn: () => T): T => {
    enterSchedulerBatch(core);
    try {
      return fn();
    } finally {
      if (SCHEDULER_PROFILE_ENABLED) profileSchedulerPolicyCounter("batchExit");

      const leftOuterBatch = leaveSchedulerBatch(core);
      if (leftOuterBatch) {
        const pending = SCHEDULER_PROFILE_ENABLED
          ? hasPendingEffects(core)
          : queue.head !== queue.tail;

        if (pending && isContextSettled()) {
          if (SCHEDULER_PROFILE_ENABLED) flushSchedulerQueue(core);
          else flushPendingSchedulerQueue(core);
        }
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
