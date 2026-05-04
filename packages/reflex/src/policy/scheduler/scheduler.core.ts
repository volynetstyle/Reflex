import { createRingQueue } from "./scheduler.queue";
import {
  cleanupQueuedNodesAfterAbort,
  flushQueuedWatchers,
} from "./scheduler.flush";
import type {
  SchedulerCore,
  EffectNode,
} from "./scheduler.types";
import { Flushing, Batching, Idle } from "./scheduler.constants";

function flushSchedulerQueue(core: SchedulerCore): void {
  const queue = core.queue;
  if (core.phase === Flushing) return;
  if (queue.size === 0) return;

  core.phase = Flushing;
  let thrown: unknown = null;

  try {
    while (queue.size !== 0) {
      thrown = flushQueuedWatchers(queue, thrown, core.priority);
    }
  } finally {
    cleanupQueuedNodesAfterAbort(queue);
    core.phase =
      core.batchDepth > 0 ? Batching : Idle;
  }

  if (thrown !== null) {
    throw thrown;
  }
}

function enterSchedulerBatch(core: SchedulerCore): void {
  if (++core.batchDepth === 1 && core.phase !== Flushing) {
    core.phase = Batching;
  }
}

function leaveSchedulerBatch(core: SchedulerCore): boolean {
  if (--core.batchDepth !== 0) {
    return false;
  }

  if (core.phase === Flushing) {
    return false;
  }

  core.phase = Idle;
  return true;
}

function resetSchedulerCore(core: SchedulerCore): void {
  cleanupQueuedNodesAfterAbort(core.queue);
  core.batchDepth = 0;
  core.phase = Idle;
}

export function createSchedulerCore(priority = false): SchedulerCore {
  const queue = createRingQueue<EffectNode>();

  const core: SchedulerCore = {
    queue,
    batchDepth: 0,
    phase: Idle,
    priority,
    flush: (): void => flushSchedulerQueue(core),
    enterBatch: (): void => enterSchedulerBatch(core),
    leaveBatch: (): boolean => leaveSchedulerBatch(core),
    reset: (): void => resetSchedulerCore(core),
  };

  return core;
}
