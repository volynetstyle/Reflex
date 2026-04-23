import type { ReactiveNode } from "@reflex/runtime";
import {
  getActiveConsumer,
  getPropagationDepth,
  Scheduled,
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
  QueueBacked,
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

function flushSchedulerQueue(core: SchedulerCore): void {
  const queue = core.queue;
  if (core.phase === SchedulerPhase.Flushing) return;
  if (queue.size === 0) return;

  core.phase = SchedulerPhase.Flushing;
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
  unscheduleQueuedNodes(core.queue);
  core.batchDepth = 0;
  core.phase = SchedulerPhase.Idle;
}

/**
 * Marks an effect watcher node as scheduled.
 *
 * This is a low-level helper used by scheduler integrations and tests to set
 * the runtime's scheduled flag on a watcher node.
 */
export function effectScheduled(node: EffectNode) {
  node.state |= Scheduled;
}

/**
 * Clears the scheduled flag from an effect watcher node.
 *
 * This is a low-level helper used by scheduler integrations and tests to mark
 * a watcher as no longer queued for execution.
 */
export function effectUnscheduled(node: EffectNode) {
  node.state &= ~Scheduled;
}

export function isContextSettled(): boolean {
  return getPropagationDepth() === 0 && getActiveConsumer() === null;
}

export function isRuntimeInactive(core: SchedulerCore): boolean {
  return (
    core.phase === SchedulerPhase.Idle &&
    core.batchDepth === 0 &&
    isContextSettled()
  );
}

export function createSchedulerCore(): SchedulerCore {
  const queue = createWatcherQueue();

  const core: SchedulerCore = {
    queue,
    batchDepth: 0,
    phase: SchedulerPhase.Idle,
    flush: (): void => flushSchedulerQueue(core),
    enterBatch: (): void => enterSchedulerBatch(core),
    leaveBatch: (): boolean => leaveSchedulerBatch(core),
    reset: (): void => resetSchedulerCore(core),
  };

  return core;
}

export function tryEnqueue(queue: WatcherQueue, node: ReactiveNode): boolean {
  const effectNode = node as EffectNode;
  const state = effectNode.state;
  if ((state & SCHEDULED_OR_DISPOSED) !== 0) {
    return false;
  }

  effectNode.state = state | Scheduled;
  pushWatcherQueue(queue, effectNode);
  return true;
}

export function attachQueueState<TInstance extends object, TItem>(
  target: TInstance,
  queue: QueueBacked<TItem>["queue"],
): TInstance & Pick<QueueBacked<TItem>, "ring" | "head"> {
  const instance = target as TInstance & Pick<QueueBacked<TItem>, "ring" | "head">;

  instance.ring = queue.ring;

  Object.defineProperty(instance, "head", {
    configurable: true,
    enumerable: true,
    get: (): number => queue.head,
  });

  return instance;
}

export function createSchedulerInstance(
  mode: EffectSchedulerMode,
  core: SchedulerCore,
  enqueue: SchedulerEnqueue,
  batch: SchedulerBatch,
  notifySettled: SchedulerNotifySettled,
  runtimeNotifySettled: SchedulerRuntimeNotifySettled,
): EffectScheduler {
  const { queue } = core;
  const scheduler = attachQueueState(
    core,
    queue,
  ) as SchedulerCore & Pick<EffectScheduler, "ring" | "head"> & {
    mode: EffectScheduler["mode"];
    runtimeNotifySettled: EffectScheduler["runtimeNotifySettled"];
    enqueue: EffectScheduler["enqueue"];
    batch: EffectScheduler["batch"];
    notifySettled: EffectScheduler["notifySettled"];
  };

  scheduler.mode = mode;
  scheduler.runtimeNotifySettled = runtimeNotifySettled;
  scheduler.enqueue = enqueue;
  scheduler.batch = batch;
  scheduler.notifySettled = notifySettled;

  return scheduler;
}
