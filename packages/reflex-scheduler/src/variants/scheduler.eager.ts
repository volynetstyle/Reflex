import { type ReactiveNode } from "@volynets/reflex-runtime/internal";
import { EffectSchedulerMode } from "../scheduler.constants";
import { hasPendingEffects, isRuntimeInactive } from "../scheduler.context";
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
import { profileSchedulerPolicyCounter } from "../scheduler.counters";

const SCHEDULER_PROFILE_ENABLED =
  typeof __PROFILE__ !== "undefined" && __PROFILE__;

export function createEagerScheduler(): EffectScheduler {
  const core = createSchedulerCore();
  const queue = core.queue;
  const notifySettled = (): void => {
    if (SCHEDULER_PROFILE_ENABLED) {
      if (isRuntimeInactive(core) && hasPendingEffects(core)) {
        flushSchedulerQueue(core);
      }
      return;
    }

    if (queue.head !== queue.tail && isRuntimeInactive(core)) {
      flushPendingSchedulerQueue(core);
    }
  };
  const enqueue = (node: ReactiveNode): void => {
    if (tryEnqueue(queue, node) && isRuntimeInactive(core)) {
      if (SCHEDULER_PROFILE_ENABLED) flushSchedulerQueue(core);
      else flushPendingSchedulerQueue(core);
    }
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

        if (pending) {
          if (SCHEDULER_PROFILE_ENABLED) flushSchedulerQueue(core);
          else flushPendingSchedulerQueue(core);
        }
      }
    }
  };

  return createSchedulerInstance(
    EffectSchedulerMode.Eager,
    core,
    enqueue,
    batch,
    notifySettled,
    notifySettled,
  );
}
