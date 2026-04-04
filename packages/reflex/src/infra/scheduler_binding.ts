import { getDefaultContext } from "@reflex/runtime";
import type { ExecutionContext } from "@reflex/runtime";
import type { EffectScheduler } from "../policy/effect_scheduler";

const EFFECT_SCHEDULER = Symbol("reflex.effect_scheduler");
type BoundExecutionContext = ExecutionContext & {
  [EFFECT_SCHEDULER]?: EffectScheduler;
};

export function bindEffectScheduler(
  context: ExecutionContext,
  scheduler: EffectScheduler,
): void {
  (context as BoundExecutionContext)[EFFECT_SCHEDULER] = scheduler;
}

export function getBoundEffectScheduler(
  context: ExecutionContext = getDefaultContext(),
): EffectScheduler | undefined {
  return (context as BoundExecutionContext)[EFFECT_SCHEDULER];
}
