import { createRingQueue } from "./scheduler.queue";
import {
  cleanupQueuedNodesAfterAbort,
  flushQueuedWatchers,
} from "./scheduler.flush";
import type { SchedulerCore, EffectNode } from "./scheduler.types";
import { Flushing, Batching, Idle } from "./scheduler.constants";

const NO_THROW: unique symbol = Symbol("NO_THROW");

function flushSchedulerQueue(core: SchedulerCore): void {
  const queue = core.queue;

  if (core.phase === Flushing) return;
  if (queue.head === queue.tail) return;

  core.phase = Flushing;

  let thrown: unknown = NO_THROW;

  try {
    thrown = flushQueuedWatchers(queue, thrown, NO_THROW);
  } finally {
    if (queue.head !== queue.tail) {
      cleanupQueuedNodesAfterAbort(queue);
    }

    core.phase = core.batchDepth > 0 ? Batching : Idle;
  }

  if (thrown !== NO_THROW) {
    throw thrown;
  }
}

function enterSchedulerBatch(core: SchedulerCore): void {
  ++core.batchDepth;

  if (core.phase === Idle) {
    core.phase = Batching;
  }
}

function leaveSchedulerBatch(core: SchedulerCore): boolean {
  const batchDepth = core.batchDepth - 1;
  core.batchDepth = batchDepth;

  if (batchDepth !== 0) {
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

export function createSchedulerCore(): SchedulerCore {
  const queue = createRingQueue<EffectNode>();

  const core: SchedulerCore = {
    queue,
    batchDepth: 0,
    phase: Idle,

    flush: (): void => flushSchedulerQueue(core),
    enterBatch: (): void => enterSchedulerBatch(core),
    leaveBatch: (): boolean => leaveSchedulerBatch(core),
    reset: (): void => resetSchedulerCore(core),
  };

  return core;
}
