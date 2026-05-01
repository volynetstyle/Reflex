import { EffectSchedulerMode } from "./scheduler.constants";
import type { EffectScheduler } from "./scheduler.types";
import {
  createEagerScheduler,
  createSabScheduler,
  createFlushScheduler,
  createRankedScheduler,
} from "./variants";

export type EffectStrategy = "flush" | "eager" | "sab" | "ranked";

const strategyMap: Record<EffectStrategy, EffectSchedulerMode> = {
  eager: EffectSchedulerMode.Eager,
  sab: EffectSchedulerMode.SAB,
  flush: EffectSchedulerMode.Flush,
  ranked: EffectSchedulerMode.Ranked,
};

export function resolveEffectSchedulerMode(
  strategy?: EffectStrategy,
): EffectSchedulerMode {
  return strategy ? strategyMap[strategy] : EffectSchedulerMode.Flush;
}

export function createEffectScheduler(
  mode: EffectSchedulerMode = EffectSchedulerMode.Flush,
): EffectScheduler {
  switch (mode) {
    case EffectSchedulerMode.Eager:
      return createEagerScheduler();
    case EffectSchedulerMode.SAB:
      return createSabScheduler();
    case EffectSchedulerMode.Ranked:
      return createRankedScheduler();
    default:
      return createFlushScheduler();
  }
}
