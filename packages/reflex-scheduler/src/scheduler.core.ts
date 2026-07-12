import { createRingQueue } from "./scheduler.queue";
import { profileSchedulerPolicyCounter } from "./scheduler.counters";
import {
  cleanupQueuedNodesAfterAbort,
  flushQueuedWatchers,
} from "./scheduler.flush";
import type { SchedulerCore, EffectNode } from "./scheduler.types";
import { Flushing, Batching, Idle } from "./scheduler.constants";

const SCHEDULER_PROFILE_ENABLED =
  typeof __PROFILE__ !== "undefined" && __PROFILE__;

const NO_THROW: unique symbol = Symbol("NO_THROW");

export function flushSchedulerQueue(core: SchedulerCore): void {
  const queue = core.queue;

  if (SCHEDULER_PROFILE_ENABLED) {
    if (core.phase === Flushing) return;
    profileSchedulerPolicyCounter("flushCalled");
    profileSchedulerPolicyCounter("schedulerQueueChecked");
    if (queue.head === queue.tail) {
      profileSchedulerPolicyCounter("flushReturnedEmpty");
      return;
    }
  } else {
    // Empty explicit flushes dominate the flush policy. Avoid touching core
    // state unless there is actual work to drain.
    if (queue.head === queue.tail || core.phase === Flushing) return;
  }

  flushPendingSchedulerQueue(core);
}

/** Drains a queue already known to be non-empty and outside a flush phase. */
export function flushPendingSchedulerQueue(core: SchedulerCore): void {
  const queue = core.queue;
  const previousPhase = core.phase;
  core.phase = Flushing;
  let thrown: unknown = NO_THROW;

  try {
    thrown = flushQueuedWatchers(queue, thrown, NO_THROW);
  } finally {
    if (queue.head !== queue.tail) {
      cleanupQueuedNodesAfterAbort(queue);
    }

    core.phase = previousPhase;
  }

  if (thrown !== NO_THROW) {
    throw thrown;
  }
}

export function enterSchedulerBatch(core: SchedulerCore): void {
  if (++core.batchDepth === 1 && core.phase !== Flushing) {
    core.phase = Batching;
  }
}

export function leaveSchedulerBatch(core: SchedulerCore): boolean {
  if (--core.batchDepth !== 0) {
    return false;
  }

  if (core.phase === Flushing) {
    return false;
  }

  core.phase = Idle;
  return true;
}

export function resetSchedulerCore(core: SchedulerCore): void {
  const activeBoundary = core.phase === Flushing || core.batchDepth > 0;

  cleanupQueuedNodesAfterAbort(core.queue, activeBoundary);

  if (activeBoundary) return;

  core.batchDepth = 0;
  core.phase = Idle;
}

export function createSchedulerCore(): SchedulerCore {
  const queue = createRingQueue<EffectNode>();

  const core: SchedulerCore = {
    queue,
    batchDepth: 0,
    phase: Idle,
  };

  return core;
}
