import {
  Scheduled,
  type ReactiveNode,
} from "@volynets/reflex-runtime/internal";
import { EffectSchedulerMode } from "../scheduler.constants";
import {
  hasPendingEffects,
  isRuntimeInactive,
} from "../scheduler.context";
import {
  createSchedulerCore,
  enterSchedulerBatch,
  flushSchedulerQueue,
  leaveSchedulerBatch,
} from "../scheduler.core";
import { createSchedulerInstance } from "../scheduler.instance";
import { pushRingQueue } from "../scheduler.queue";
import type { EffectScheduler } from "../scheduler.types";

export function createEagerScheduler(): EffectScheduler {
  const core = createSchedulerCore();
  const notifySettled = (): void => {
    if (isRuntimeInactive(core) && hasPendingEffects(core)) {
      flushSchedulerQueue(core);
    }
  };
  const enqueue = (node: ReactiveNode): void => {
    const state = node.state;
    if ((state & Scheduled) !== 0) return;
    node.state = state | Scheduled;
    pushRingQueue(core.queue, node);

    if (isRuntimeInactive(core)) flushSchedulerQueue(core);
  };
  const batch = <T>(fn: () => T): T => {
    enterSchedulerBatch(core);
    try {
      return fn();
    } finally {
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
