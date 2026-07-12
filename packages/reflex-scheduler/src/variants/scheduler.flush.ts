import { type ReactiveNode } from "@volynets/reflex-runtime/internal";
import { EffectSchedulerMode } from "../scheduler.constants";
import { createSchedulerCore } from "../scheduler.core";
import { Batching, Flushing, Idle } from "../scheduler.constants";
import { tryEnqueue } from "../scheduler.enqueue";
import { createSchedulerInstance } from "../scheduler.instance";
import type { EffectScheduler } from "../scheduler.types";
import { noopNotifySettled } from "../scheduler.types";
import { profileSchedulerPolicyCounter } from "../scheduler.counters";

const SCHEDULER_PROFILE_ENABLED =
  typeof __PROFILE__ !== "undefined" && __PROFILE__;

export function createFlushScheduler(): EffectScheduler {
  const core = createSchedulerCore();
  const queue = core.queue;
  const enqueue = (node: ReactiveNode): void => {
    tryEnqueue(queue, node);
  };
  const batch = <T>(fn: () => T): T => {
    if (++core.batchDepth === 1 && core.phase !== Flushing) {
      core.phase = Batching;
    }

    try {
      return fn();
    } finally {
      if (SCHEDULER_PROFILE_ENABLED) profileSchedulerPolicyCounter("batchExit");

      if (--core.batchDepth === 0 && core.phase !== Flushing) {
        core.phase = Idle;
      }
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
