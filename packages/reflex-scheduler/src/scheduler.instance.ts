import type { EffectSchedulerMode } from "./scheduler.constants";
import {
  flushSchedulerQueue,
  resetSchedulerCore,
} from "./scheduler.core";
import type {
  EffectScheduler,
  SchedulerBatch,
  SchedulerCore,
  SchedulerEnqueue,
  SchedulerNotifySettled,
  SchedulerRuntimeNotifySettled,
} from "./scheduler.types";

export function createSchedulerInstance(
  mode: EffectSchedulerMode,
  core: SchedulerCore,
  enqueue: SchedulerEnqueue,
  batch: SchedulerBatch,
  notifySettled: SchedulerNotifySettled,
  runtimeNotifySettled: SchedulerRuntimeNotifySettled,
): EffectScheduler {
  return {
    mode,
    core,
    runtimeNotifySettled,
    enqueue,
    batch,
    notifySettled,
    flush: (): void => flushSchedulerQueue(core),
    reset: (): void => resetSchedulerCore(core),
  };
}
