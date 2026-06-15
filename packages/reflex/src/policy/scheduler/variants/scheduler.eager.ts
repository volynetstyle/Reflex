import {
  Scheduled,
  type ReactiveNode,
} from "@volynets/reflex-runtime/internal";
import { EffectSchedulerMode } from "../scheduler.constants";
import { hasPendingEffects, isRuntimeInactive } from "../scheduler.context";
import {
  createSchedulerCore,
  enterSchedulerBatch,
  flushSchedulerQueue,
  leaveSchedulerBatch,
} from "../scheduler.core";
import { tryEnqueue } from "../scheduler.enqueue";
import { createSchedulerInstance } from "../scheduler.instance";
import type { EffectScheduler } from "../scheduler.types";
import {
  schedulerPolicyCounters,
  schedulerPolicyCountersEnabled,
} from "../scheduler.counters";

export function createEagerScheduler(): EffectScheduler {
  const core = createSchedulerCore();
  const notifySettled = (): void => {
    if (isRuntimeInactive(core) && hasPendingEffects(core)) {
      flushSchedulerQueue(core);
    }
  };
  const enqueue = (node: ReactiveNode): void => {
    if (tryEnqueue(core.queue, node) && isRuntimeInactive(core)) {
      flushSchedulerQueue(core);
    }
  };
  const batch = <T>(fn: () => T): T => {
    enterSchedulerBatch(core);
    try {
      return fn();
    } finally {
      if (__PROFILE__ && schedulerPolicyCountersEnabled) {
        schedulerPolicyCounters.batchExit += 1;
      }

      if (leaveSchedulerBatch(core) && hasPendingEffects(core)) {
        flushSchedulerQueue(core);
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
