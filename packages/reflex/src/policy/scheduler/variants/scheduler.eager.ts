import type { ReactiveNode } from "@volynets/reflex-runtime";
import { EffectSchedulerMode } from "../scheduler.constants";
import {
  hasPendingEffects,
  isRuntimeInactive,
} from "../scheduler.context";
import {
  createSchedulerCore,
} from "../scheduler.core";
import { tryEnqueue } from "../scheduler.enqueue";
import { createSchedulerInstance } from "../scheduler.instance";
import type { EffectScheduler } from "../scheduler.types";

export function createEagerScheduler(): EffectScheduler {
  const core = createSchedulerCore(true);
  const notifySettled = (): void => {
    if (isRuntimeInactive(core) && hasPendingEffects(core)) {
      core.flush();
    }
  };
  const enqueue = (node: ReactiveNode): void => {
    if (!tryEnqueue(core.queue, node)) return;
    if (isRuntimeInactive(core)) core.flush();
  };
  const batch = <T>(fn: () => T): T => {
    core.enterBatch();
    try {
      return fn();
    } finally {
      if (core.leaveBatch() && hasPendingEffects(core)) {
        core.flush();
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
