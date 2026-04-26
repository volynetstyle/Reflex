import type { ReactiveNode } from "@volynets/reflex-runtime";
import { runWatcher } from "@volynets/reflex-runtime";
import {
  EffectSchedulerMode,
  SchedulerPhase,
  UNSCHEDULE_MASK,
} from "../scheduler.constants";
import {
  createSchedulerCore,
  createSchedulerInstance,
  tryEnqueueEffect,
} from "../scheduler.core";
import { clearWatcherQueue, shiftWatcherQueue } from "../scheduler.queue";
import type {
  EffectNode,
  EffectScheduler,
  SchedulerCore,
} from "../scheduler.types";
import { noopNotifySettled } from "../scheduler.types";
import type { RankedEffectNode } from "../../../infra";

type RankedSchedulerCore = SchedulerCore & {
  rankedHeads: (RankedEffectNode | undefined)[];
  activePriorities: number[];
};

function unscheduleQueuedNodes(queue: RankedSchedulerCore["queue"]): void {
  while (queue.size !== 0) {
    shiftWatcherQueue(queue)!.state &= UNSCHEDULE_MASK;
  }

  clearWatcherQueue(queue);
}

function unschedulePendingNodes(
  rankedHeads: (RankedEffectNode | undefined)[],
  activePriorities: readonly number[],
): void {
  for (let index = 0; index < activePriorities.length; ++index) {
    const priority = activePriorities[index]!;
    let head = rankedHeads[priority];
    if (head === undefined) continue;

    while (head !== undefined) {
      const current = head;
      head = shiftBucketHead(current);
      current.state &= UNSCHEDULE_MASK;
    }

    rankedHeads[priority] = undefined;
  }
}

function getNodePriority(node: RankedEffectNode): number {
  return node.priority ?? node.rank ?? 0;
}

function detachRankedNode(node: RankedEffectNode): void {
  node.prevRanked = node;
  node.nextRanked = undefined;
}

function shiftBucketHead(node: RankedEffectNode): RankedEffectNode | undefined {
  const next = node.nextRanked;

  if (next === undefined || next === node) {
    detachRankedNode(node);
    return undefined;
  }

  const prev = node.prevRanked;
  prev.nextRanked = next;
  next.prevRanked = prev;
  detachRankedNode(node);
  return next;
}

function insertActivePriorityDesc(
  activePriorities: number[],
  priority: number,
): void {
  let index = activePriorities.length;

  while (index > 0 && activePriorities[index - 1]! < priority) {
    activePriorities[index] = activePriorities[index - 1]!;
    --index;
  }

  activePriorities[index] = priority;
}

function pushPendingNode(
  core: RankedSchedulerCore,
  effectNode: EffectNode,
): void {
  const node = effectNode as RankedEffectNode;
  const priority = getNodePriority(node);
  const heads = core.rankedHeads;

  if (priority >= heads.length) {
    heads.length = priority + 1;
  }

  const head = heads[priority];

  node.rankedPriority = priority;
  if (head === undefined) {
    node.prevRanked = node;
    node.nextRanked = node;
    heads[priority] = node;
    insertActivePriorityDesc(core.activePriorities, priority);
    return;
  }

  const tail = head.prevRanked;
  tail.nextRanked = node;
  node.prevRanked = tail;
  node.nextRanked = head;
  head.prevRanked = node;
}

function resetPendingBuckets(core: RankedSchedulerCore): void {
  const activePriorities = core.activePriorities;
  const rankedHeads = core.rankedHeads;

  for (let index = 0; index < activePriorities.length; ++index) {
    rankedHeads[activePriorities[index]!] = undefined;
  }

  activePriorities.length = 0;
}

function rankedFlush(this: RankedSchedulerCore): void {
  const queue = this.queue;
  const rankedHeads = this.rankedHeads;
  const activePriorities = this.activePriorities;
  if (this.phase === SchedulerPhase.Flushing) return;
  if (queue.size === 0 && this.renderQueue.size === 0) return;

  this.phase = SchedulerPhase.Flushing;
  let thrown: unknown = null;

  try {
    while (
      this.renderQueue.size !== 0 ||
      queue.size !== 0 ||
      activePriorities.length !== 0
    ) {
      while (this.renderQueue.size !== 0) {
        const node = shiftWatcherQueue(this.renderQueue)!;
        node.state &= UNSCHEDULE_MASK;
        try {
          runWatcher(node);
        } catch (error) {
          if (thrown === null) {
            thrown = error;
          }
        }
      }

      while (queue.size !== 0) {
        pushPendingNode(this, shiftWatcherQueue(queue)!);
      }

      for (let index = 0; index < activePriorities.length; ++index) {
        const priority = activePriorities[index]!;
        let node = rankedHeads[priority];

        while (node !== undefined) {
          rankedHeads[priority] = shiftBucketHead(node);
          node.state &= UNSCHEDULE_MASK;
          try {
            runWatcher(node);
          } catch (error) {
            if (thrown === null) {
              thrown = error;
            }
          }

          node = rankedHeads[priority];
        }
      }

      activePriorities.length = 0;
    }
  } finally {
    unscheduleQueuedNodes(this.renderQueue);
    unschedulePendingNodes(rankedHeads, activePriorities);
    resetPendingBuckets(this);
    unscheduleQueuedNodes(queue);
    this.phase =
      this.batchDepth > 0 ? SchedulerPhase.Batching : SchedulerPhase.Idle;
  }

  if (thrown !== null) {
    throw thrown;
  }
}

export function createRankedScheduler(): EffectScheduler {
  const core = createSchedulerCore() as RankedSchedulerCore;
  core.rankedHeads = [];
  core.activePriorities = [];
  core.flush = rankedFlush;
  const enqueue = (node: ReactiveNode): void => {
    tryEnqueueEffect(core, node);
  };

  const batch = <T>(fn: () => T): T => {
    core.enterBatch();
    try {
      return fn();
    } finally {
      core.leaveBatch();
    }
  };

  return createSchedulerInstance(
    EffectSchedulerMode.Ranked,
    core,
    enqueue,
    batch,
    noopNotifySettled,
    undefined,
  );
}
