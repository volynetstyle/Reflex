import {
  getCurrentConsumer,
  getPropagationScopeDepth,
} from "@volynets/reflex-runtime/internal";
import type { SchedulerCore } from "./scheduler.types";
import { Idle } from ".";

export function isContextSettled(): boolean {
  return getCurrentConsumer() === null && getPropagationScopeDepth() === 0;
}

export function isRuntimeInactive(core: SchedulerCore): boolean {
  return core.phase === Idle && core.batchDepth === 0 && isContextSettled();
}

export function hasPendingEffects(core: SchedulerCore): boolean {
  const q = core.queue;
  return q.head !== q.tail; 
}
