import {
  Scheduled,
  type ReactiveNode,
} from "@volynets/reflex-runtime/internal";
import { EffectSchedulerMode } from "../scheduler.constants";
import {
  hasPendingEffects,
  isContextSettled,
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
import { noopNotifySettled } from "../scheduler.types";

export function createSabScheduler(): EffectScheduler {
  const core = createSchedulerCore();
  const enqueue = (node: ReactiveNode): void => {
    const state = node.state;
    if ((state & Scheduled) !== 0) return;
    node.state = state | Scheduled;
    pushRingQueue(core.queue, node);
  };
  const batch = <T>(fn: () => T): T => {
    enterSchedulerBatch(core);
    try {
      return fn();
    } finally {
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
