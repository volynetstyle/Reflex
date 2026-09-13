import {
  currentConsumer,
  getActiveRuntimeContext,
  propagationScopeDepth,
  type RuntimeContext,
} from "@volynets/reflex-runtime/internal";
import { profileSchedulerPolicyCounter } from "./scheduler.counters";
import type { SchedulerCore } from "./scheduler.types";
import { Idle } from "./scheduler.constants";

const SCHEDULER_PROFILE_ENABLED =
  typeof __PROFILE__ !== "undefined" && __PROFILE__;

export function isContextSettled(
  context: RuntimeContext = getActiveRuntimeContext(),
): boolean {
  if (context !== getActiveRuntimeContext()) {
    return (
      context.propagationScopeDepth === 0 && context.currentConsumer === null
    );
  }

  return propagationScopeDepth === 0 && currentConsumer === null;
}

export function isRuntimeInactive(core: SchedulerCore): boolean {
  return core.phase === Idle && isContextSettled();
}

export function hasPendingEffects(core: SchedulerCore): boolean {
  if (SCHEDULER_PROFILE_ENABLED)
    profileSchedulerPolicyCounter("pendingWatcherChecks");
  if (SCHEDULER_PROFILE_ENABLED)
    profileSchedulerPolicyCounter("schedulerQueueChecked");

  const q = core.queue;
  return q.head !== q.tail;
}
