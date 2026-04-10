import type { ExecutionContext, ReactiveNode } from "@reflex/runtime";
import { ReactiveNodeState, runWatcher } from "@reflex/runtime";
import { createWatcherQueue } from "./scheduler.queue";
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

export function isContextSettled(context: ExecutionContext): boolean {
  return context.propagationDepth === 0 && context.activeComputed === null;
}

export function isRuntimeInactive(
  context: ExecutionContext,
  core: SchedulerCore,
): boolean {
  return (
    core.phase === SchedulerPhase.Idle &&
    core.batchDepth === 0 &&
    isContextSettled(context)
  );
}

export function createSchedulerCore(): SchedulerCore {
  const queue = createWatcherQueue();
  let batchDepth = 0;
  let phase = SchedulerPhase.Idle;

  function flush(): void {
    if (phase === SchedulerPhase.Flushing) return;
    if (queue.size === 0) return;

    phase = SchedulerPhase.Flushing;

    try {
      while (queue.size !== 0) {
        const node = queue.shift()!;
        node.state &= UNSCHEDULE_MASK;
        runWatcher(node);
      }
    } finally {
      queue.clear();
      phase = batchDepth > 0 ? SchedulerPhase.Batching : SchedulerPhase.Idle;
    }
  }

  return {
    queue,
    flush,

    enterBatch() {
      if (++batchDepth === 1 && phase !== SchedulerPhase.Flushing) {
        phase = SchedulerPhase.Batching;
      }
    },

    leaveBatch() {
      if (--batchDepth !== 0) {
        return false;
      }

      if (phase === SchedulerPhase.Flushing) {
        return false;
      }

      phase = SchedulerPhase.Idle;
      return true;
    },

    reset() {
      while (queue.size !== 0) {
        queue.shift()!.state &= UNSCHEDULE_MASK;
      }

      queue.clear();
      batchDepth = 0;
      phase = SchedulerPhase.Idle;
    },
    get batchDepth() {
      return batchDepth;
    },
    get phase() {
      return phase;
    },
  };
}

export function tryEnqueue(queue: WatcherQueue, node: ReactiveNode): boolean {
  const effectNode = node as EffectNode;
  const state = effectNode.state;
  if ((state & SCHEDULED_OR_DISPOSED) !== 0) {
    return false;
  }

  effectNode.state = state | ReactiveNodeState.Scheduled;
  queue.push(effectNode);
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
  return {
    ring: core.queue.ring,
    mode,
    context,
    runtimeNotifySettled,
    enqueue,
    batch,
    flush: core.flush,
    notifySettled,
    reset: core.reset,

    get head() {
      return core.queue.head;
    },
    get batchDepth() {
      return core.batchDepth;
    },
    get phase() {
      return core.phase;
    },
  };
}
