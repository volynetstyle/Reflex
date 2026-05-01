import {
  getActiveConsumer,
  getPropagationDepth,
} from "@volynets/reflex-runtime";
import { SchedulerPhase } from "./scheduler.constants";
import type { SchedulerCore } from "./scheduler.types";

export function isContextSettled(): boolean {
  return getPropagationDepth() === 0 && getActiveConsumer() === null;
}

export function isRuntimeInactive(core: SchedulerCore): boolean {
  return (
    core.phase === SchedulerPhase.Idle &&
    core.batchDepth === 0 &&
    isContextSettled()
  );
}

export function hasPendingEffects(core: SchedulerCore): boolean {
  return core.queue.size !== 0;
}
