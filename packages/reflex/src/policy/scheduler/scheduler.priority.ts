import { runWatcher } from "@volynets/reflex-runtime";
import {
  SchedulerPhase,
  UNSCHEDULE_MASK,
} from "./scheduler.constants";
import { clearWatcherQueue, shiftWatcherQueue } from "./scheduler.queue";
import type {
  EffectNode,
  SchedulerCore,
  WatcherQueue,
} from "./scheduler.types";

function unscheduleQueuedNodes(queue: WatcherQueue): void {
  while (queue.size !== 0) {
    shiftWatcherQueue(queue)!.state &= UNSCHEDULE_MASK;
  }

  clearWatcherQueue(queue);
}

function getEffectPriority(node: EffectNode): number {
  return (node as EffectNode & { priority?: number }).priority ?? 0;
}

function runQueuedWatcher(node: EffectNode, thrown: unknown): unknown {
  node.state &= UNSCHEDULE_MASK;

  try {
    runWatcher(node);
  } catch (error) {
    if (thrown === null) {
      return error;
    }
  }

  return thrown;
}

function flushPriorityQueue(queue: WatcherQueue, thrown: unknown): unknown {
  const pending: EffectNode[] = [];

  while (queue.size !== 0) {
    pending.push(shiftWatcherQueue(queue)!);
  }

  pending.sort(
    (left, right) => getEffectPriority(right) - getEffectPriority(left),
  );

  for (let index = 0; index < pending.length; index++) {
    thrown = runQueuedWatcher(pending[index]!, thrown);
  }

  return thrown;
}

export function flushPrioritySchedulerQueue(core: SchedulerCore): void {
  const queue = core.queue;
  if (core.phase === SchedulerPhase.Flushing) return;
  if (queue.size === 0) return;

  core.phase = SchedulerPhase.Flushing;
  let thrown: unknown = null;

  try {
    while (queue.size !== 0) {
      thrown = flushPriorityQueue(queue, thrown);
    }
  } finally {
    unscheduleQueuedNodes(queue);
    core.phase =
      core.batchDepth > 0 ? SchedulerPhase.Batching : SchedulerPhase.Idle;
  }

  if (thrown !== null) {
    throw thrown;
  }
}
