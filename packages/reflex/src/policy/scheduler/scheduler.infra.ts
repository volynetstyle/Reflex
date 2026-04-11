import type { ExecutionContext } from "@reflex/runtime";
import { getDefaultContext } from "@reflex/runtime";
import { EffectSchedulerMode } from "./scheduler.constants";
import type { EffectScheduler } from "./scheduler.types";
import {
  createEagerScheduler,
  createSabScheduler,
  createFlushScheduler,
} from "./variants";

export type EffectStrategy = "flush" | "eager" | "sab";

const strategyMap: Record<EffectStrategy, EffectSchedulerMode> = {
  eager: EffectSchedulerMode.Eager,
  sab: EffectSchedulerMode.SAB,
  flush: EffectSchedulerMode.Flush,
};

export function resolveEffectSchedulerMode(
  strategy?: EffectStrategy,
): EffectSchedulerMode {
  return strategy ? strategyMap[strategy] : EffectSchedulerMode.Flush;
}

export function createEffectScheduler(
  mode: EffectSchedulerMode = EffectSchedulerMode.Flush,
  context: ExecutionContext = getDefaultContext(),
): EffectScheduler {
  switch (mode) {
    case EffectSchedulerMode.Eager:
      return createEagerScheduler(context);
    case EffectSchedulerMode.SAB:
      return createSabScheduler(context);
    default:
      return createFlushScheduler(context);
  }
}
