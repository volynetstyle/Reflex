import type { ReactiveNode } from "@volynets/reflex-runtime";
import { EffectSchedulerMode } from "../scheduler.constants";
import {
  createSchedulerCore,
  hasPendingEffects,
  isRuntimeInactive,
  createSchedulerInstance,
  tryEnqueueEffect,
} from "../scheduler.core";
import type { EffectScheduler } from "../scheduler.types";

export function createEagerScheduler(): EffectScheduler {
  const core = createSchedulerCore();
  const notifySettled = (): void => {
    if (isRuntimeInactive(core) && hasPendingEffects(core)) {
      core.flush();
    }
  };
  const enqueue = (node: ReactiveNode): void => {
    if (!tryEnqueueEffect(core, node)) return;
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
