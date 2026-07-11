import type { ReactiveNode } from "@volynets/reflex-runtime/internal";

import { EffectSchedulerMode } from "./scheduler.constants";
import { hasPendingEffects, isRuntimeInactive } from "./scheduler.context";
import { flushSchedulerQueue } from "./scheduler.core";
import { tryEnqueue } from "./scheduler.enqueue";
import type { EffectScheduler, SchedulerCore } from "./scheduler.types";
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

/** Applies enqueue policy directly to scheduler state. */
export function enqueueEffectByPolicy(
  core: SchedulerCore,
  mode: EffectSchedulerMode,
  node: ReactiveNode,
): void {
  const enqueued = tryEnqueue(core.queue, node);

  if (
    enqueued &&
    mode === EffectSchedulerMode.Eager &&
    isRuntimeInactive(core)
  ) {
    flushSchedulerQueue(core);
  }
}

/** Consumes a runtime-settled notification according to scheduler policy. */
export function notifyEffectSchedulerSettled(
  core: SchedulerCore,
  mode: EffectSchedulerMode,
): void {
  if (
    mode === EffectSchedulerMode.Eager &&
    isRuntimeInactive(core) &&
    hasPendingEffects(core)
  ) {
    flushSchedulerQueue(core);
  }
}

export function createEffectScheduler(
  mode: EffectSchedulerMode = EffectSchedulerMode.Flush,
): EffectScheduler {
  switch (mode) {
    case EffectSchedulerMode.Eager:
      return createEagerScheduler();
    case EffectSchedulerMode.SAB:
      return createSabScheduler();
    default:
      return createFlushScheduler();
  }
}
