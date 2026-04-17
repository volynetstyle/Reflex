import type { ExecutionContext, ReactiveNode } from "@reflex/runtime";
import {
  getActiveComputed,
  getPropagationDepth,
  ReactiveNodeState,
  runWatcher,
} from "@reflex/runtime";
import {
  clearWatcherQueue,
  createWatcherQueue,
  pushWatcherQueue,
  shiftWatcherQueue,
} from "./scheduler.queue";
import type { EffectSchedulerMode } from "./scheduler.constants";
import {
  SCHEDULED_OR_DISPOSED,
  SchedulerPhase,
  UNSCHEDULE_MASK,
} from "./scheduler.constants";
import type {
  SchedulerCore,
  SchedulerEnqueue,
  SchedulerBatch,
  SchedulerNotifySettled,
  SchedulerRuntimeNotifySettled,
  EffectScheduler,
  EffectNode,
  WatcherQueue,
} from "./scheduler.types";

function unscheduleQueuedNodes(queue: WatcherQueue): void {
  while (queue.size !== 0) {
    shiftWatcherQueue(queue)!.state &= UNSCHEDULE_MASK;
  }

  clearWatcherQueue(queue);
}

function flushSchedulerQueue(this: SchedulerCore): void {
  const queue = this.queue;
  if (this.phase === SchedulerPhase.Flushing) return;
  if (queue.size === 0) return;

  this.phase = SchedulerPhase.Flushing;
  let thrown: unknown = null;

  try {
    while (queue.size !== 0) {
      const node = shiftWatcherQueue(queue)!;
      node.state &= UNSCHEDULE_MASK;
      try {
        runWatcher(node);
      } catch (error) {
        if (thrown === null) {
          thrown = error;
        }
      }
    }
  } finally {
    unscheduleQueuedNodes(queue);
    this.phase =
      this.batchDepth > 0 ? SchedulerPhase.Batching : SchedulerPhase.Idle;
  }

  if (thrown !== null) {
    throw thrown;
  }
}

function enterSchedulerBatch(this: SchedulerCore): void {
  if (++this.batchDepth === 1 && this.phase !== SchedulerPhase.Flushing) {
    this.phase = SchedulerPhase.Batching;
  }
}

function leaveSchedulerBatch(this: SchedulerCore): boolean {
  if (--this.batchDepth !== 0) {
    return false;
  }

  if (this.phase === SchedulerPhase.Flushing) {
    return false;
  }

  this.phase = SchedulerPhase.Idle;
  return true;
}

function resetSchedulerCore(this: SchedulerCore): void {
  unscheduleQueuedNodes(this.queue);
  this.batchDepth = 0;
  this.phase = SchedulerPhase.Idle;
}

function getSchedulerHead(this: SchedulerCore): number {
  return this.queue.head;
}

/**
 * Marks an effect watcher node as scheduled.
 *
 * This is a low-level helper used by scheduler integrations and tests to set
 * the runtime's scheduled flag on a watcher node.
 */
export function effectScheduled(node: EffectNode) {
  node.state |= ReactiveNodeState.Scheduled;
}

/**
 * Clears the scheduled flag from an effect watcher node.
 *
 * This is a low-level helper used by scheduler integrations and tests to mark
 * a watcher as no longer queued for execution.
 */
export function effectUnscheduled(node: EffectNode) {
  node.state &= ~ReactiveNodeState.Scheduled;
}

export function isContextSettled(): boolean {
  return getPropagationDepth() === 0 && getActiveComputed() === null;
}

export function isRuntimeInactive(core: SchedulerCore): boolean {
  return (
    core.phase === SchedulerPhase.Idle &&
    core.batchDepth === 0 &&
    isContextSettled()
  );
}

export function createSchedulerCore(): SchedulerCore {
  return {
    queue: createWatcherQueue(),
    batchDepth: 0,
    phase: SchedulerPhase.Idle,
    flush: flushSchedulerQueue,
    enterBatch: enterSchedulerBatch,
    leaveBatch: leaveSchedulerBatch,
    reset: resetSchedulerCore,
  };
}

export function tryEnqueue(queue: WatcherQueue, node: ReactiveNode): boolean {
  const effectNode = node as EffectNode;
  const state = effectNode.state;
  if ((state & SCHEDULED_OR_DISPOSED) !== 0) {
    return false;
  }

  effectNode.state = state | ReactiveNodeState.Scheduled;
  pushWatcherQueue(queue, effectNode);
  return true;
}

export function createSchedulerInstance(
  mode: EffectSchedulerMode,
  context: ExecutionContext,
  core: SchedulerCore,
  enqueue: SchedulerEnqueue,
  batch: SchedulerBatch,
  notifySettled: SchedulerNotifySettled,
  runtimeNotifySettled: SchedulerRuntimeNotifySettled,
): EffectScheduler {
  const scheduler = core as SchedulerCore & {
    ring: EffectScheduler["ring"];
    mode: EffectScheduler["mode"];
    context: EffectScheduler["context"];
    runtimeNotifySettled: EffectScheduler["runtimeNotifySettled"];
    enqueue: EffectScheduler["enqueue"];
    batch: EffectScheduler["batch"];
    notifySettled: EffectScheduler["notifySettled"];
    head: number;
  };

  scheduler.ring = core.queue.ring;
  scheduler.mode = mode;
  scheduler.context = context;
  scheduler.runtimeNotifySettled = runtimeNotifySettled;
  scheduler.enqueue = enqueue;
  scheduler.batch = batch;
  scheduler.notifySettled = notifySettled;

  Object.defineProperty(scheduler, "head", {
    configurable: true,
    enumerable: true,
    get: getSchedulerHead,
  });

  return scheduler;
}
