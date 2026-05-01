import { createRingQueue } from "./scheduler.queue";
import { SchedulerPhase } from "./scheduler.constants";
import {
  cleanupQueuedNodesAfterAbort,
  flushQueuedWatchers,
} from "./scheduler.flush";
import type {
  SchedulerCore,
  EffectNode,
} from "./scheduler.types";

function flushSchedulerQueue(core: SchedulerCore): void {
  const queue = core.queue;
  if (core.phase === SchedulerPhase.Flushing) return;
  if (queue.size === 0) return;

  core.phase = SchedulerPhase.Flushing;
  let thrown: unknown = null;

  try {
    while (queue.size !== 0) {
      thrown = flushQueuedWatchers(queue, thrown, core.priority);
    }
  } finally {
    cleanupQueuedNodesAfterAbort(queue);
    core.phase =
      core.batchDepth > 0 ? SchedulerPhase.Batching : SchedulerPhase.Idle;
  }

  if (thrown !== null) {
    throw thrown;
  }
}

function enterSchedulerBatch(core: SchedulerCore): void {
  if (++core.batchDepth === 1 && core.phase !== SchedulerPhase.Flushing) {
    core.phase = SchedulerPhase.Batching;
  }
}

function leaveSchedulerBatch(core: SchedulerCore): boolean {
  if (--core.batchDepth !== 0) {
    return false;
  }

  if (core.phase === SchedulerPhase.Flushing) {
    return false;
  }

  core.phase = SchedulerPhase.Idle;
  return true;
}

function resetSchedulerCore(core: SchedulerCore): void {
  cleanupQueuedNodesAfterAbort(core.queue);
  core.batchDepth = 0;
  core.phase = SchedulerPhase.Idle;
}

export function createSchedulerCore(priority = false): SchedulerCore {
  const queue = createRingQueue<EffectNode>();

  const core: SchedulerCore = {
    queue,
    batchDepth: 0,
    phase: SchedulerPhase.Idle,
    priority,
    flush: (): void => flushSchedulerQueue(core),
    enterBatch: (): void => enterSchedulerBatch(core),
    leaveBatch: (): boolean => leaveSchedulerBatch(core),
    reset: (): void => resetSchedulerCore(core),
  };

  return core;
}
