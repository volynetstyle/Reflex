import {
  currentConsumer,
  propagationScopeDepth,
} from "@volynets/reflex-runtime/internal";
import { profileSchedulerPolicyCounter } from "./scheduler.counters";
import type { SchedulerCore } from "./scheduler.types";
import { Idle } from ".";

export function isContextSettled(): boolean {
  return currentConsumer === null && propagationScopeDepth === 0;
}

export function isRuntimeInactive(core: SchedulerCore): boolean {
  return core.phase === Idle && core.batchDepth === 0 && isContextSettled();
}

export function hasPendingEffects(core: SchedulerCore): boolean {
  profileSchedulerPolicyCounter("pendingWatcherChecks");
  profileSchedulerPolicyCounter("schedulerQueueChecked");

  const q = core.queue;
  return q.head !== q.tail;
}
