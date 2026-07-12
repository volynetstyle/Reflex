import type { ReactiveNode } from "@volynets/reflex-runtime/internal";

import { EffectSchedulerMode } from "./scheduler.constants";
import { hasPendingEffects, isRuntimeInactive } from "./scheduler.context";
import {
  flushPendingSchedulerQueue,
  flushSchedulerQueue,
} from "./scheduler.core";
import { tryEnqueue } from "./scheduler.enqueue";
import type { EffectScheduler, SchedulerCore } from "./scheduler.types";
import {
  createEagerScheduler,
  createSabScheduler,
  createFlushScheduler,
} from "./variants";

const SCHEDULER_PROFILE_ENABLED =
  typeof __PROFILE__ !== "undefined" && __PROFILE__;

export type EffectStrategy = "flush" | "eager" | "sab";

export function resolveEffectSchedulerMode(
  strategy?: EffectStrategy,
): EffectSchedulerMode {
  switch (strategy) {
    case "eager":
      return EffectSchedulerMode.Eager;
    case "sab":
      return EffectSchedulerMode.SAB;
    default:
      return EffectSchedulerMode.Flush;
  }
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
    if (SCHEDULER_PROFILE_ENABLED) flushSchedulerQueue(core);
    else flushPendingSchedulerQueue(core);
  }
}

/** Consumes a runtime-settled notification according to scheduler policy. */
export function notifyEffectSchedulerSettled(
  core: SchedulerCore,
  mode: EffectSchedulerMode,
): void {
  if (mode !== EffectSchedulerMode.Eager) return;

  if (SCHEDULER_PROFILE_ENABLED) {
    if (isRuntimeInactive(core) && hasPendingEffects(core)) {
      flushSchedulerQueue(core);
    }
    return;
  }

  const queue = core.queue;
  if (queue.head !== queue.tail && isRuntimeInactive(core)) {
    flushPendingSchedulerQueue(core);
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
