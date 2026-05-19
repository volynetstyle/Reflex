import {
  getActiveConsumer,
  getPropagationDepth,
} from "@volynets/reflex-runtime";
import type { SchedulerCore } from "./scheduler.types";
import { Idle } from ".";

export function isContextSettled(): boolean {
  return getActiveConsumer() === null && getPropagationDepth() === 0;
}

export function isRuntimeInactive(core: SchedulerCore): boolean {
  return core.phase === Idle && core.batchDepth === 0 && isContextSettled();
}

export function hasPendingEffects(core: SchedulerCore): boolean {
  return core.queue.head !== core.queue.tail;
}
