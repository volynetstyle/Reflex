import {
  getCurrentConsumer,
  getPropagationScopeDepth,
} from "@volynets/reflex-runtime/internal";
import {
  schedulerPolicyCounters,
  schedulerPolicyCountersEnabled,
} from "./scheduler.counters";
import type { SchedulerCore } from "./scheduler.types";
import { Idle } from ".";

export function isContextSettled(): boolean {
  return getCurrentConsumer() === null && getPropagationScopeDepth() === 0;
}

export function isRuntimeInactive(core: SchedulerCore): boolean {
  return core.phase === Idle && core.batchDepth === 0 && isContextSettled();
}

export function hasPendingEffects(core: SchedulerCore): boolean {
  if (__PROFILE__ && schedulerPolicyCountersEnabled) {
    schedulerPolicyCounters.pendingWatcherChecks += 1;
    schedulerPolicyCounters.schedulerQueueChecked += 1;
  }

  const q = core.queue;
  return q.head !== q.tail;
}
