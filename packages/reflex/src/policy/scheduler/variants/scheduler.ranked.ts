import type { ReactiveNode } from "@reflex/runtime";
import { runWatcher } from "@reflex/runtime";
import {
  EffectSchedulerMode,
  SchedulerPhase,
  UNSCHEDULE_MASK,
} from "../scheduler.constants";
import {
  createSchedulerCore,
  createSchedulerInstance,
  tryEnqueue,
} from "../scheduler.core";
import {
  clearWatcherQueue,
  shiftWatcherQueue,
} from "../scheduler.queue";
import type {
  EffectNode,
  EffectScheduler,
  SchedulerCore,
} from "../scheduler.types";
import { noopNotifySettled } from "../scheduler.types";

type RankedEffectNode = EffectNode & {
  priority?: number;
  rank?: number;
  rankedPriority: number;
  nextRanked: RankedEffectNode | undefined;
  prevRanked: RankedEffectNode;
};

type RankedSchedulerCore = SchedulerCore & {
  rankedHeads: (RankedEffectNode | undefined)[];
  minPriority: number;
  maxPriority: number;
};

function unscheduleQueuedNodes(queue: RankedSchedulerCore["queue"]): void {
  while (queue.size !== 0) {
    shiftWatcherQueue(queue)!.state &= UNSCHEDULE_MASK;
  }

  clearWatcherQueue(queue);
}

function unschedulePendingNodes(
  rankedHeads: readonly (RankedEffectNode | undefined)[],
  processedPriority: number,
  processedNode: RankedEffectNode | undefined,
): void {
  for (let priority = 0; priority < rankedHeads.length; ++priority) {
    const head = rankedHeads[priority];
    if (head === undefined) continue;

    let node = head;
    do {
      const current = node;
      node = current.nextRanked ?? head;
      if (
        priority === processedPriority &&
        processedNode !== undefined &&
        current === processedNode
      ) {
        break;
      }
      current.state &= UNSCHEDULE_MASK;
    } while (node !== head);
    if (
      priority === processedPriority &&
      processedNode !== undefined &&
      processedNode.state !== undefined
    ) {
      let tail = processedNode.nextRanked;
      while (tail !== undefined && tail !== head) {
        tail.state &= UNSCHEDULE_MASK;
        tail = tail.nextRanked;
      }
    }
  }
}

function getNodePriority(node: EffectNode): number {
  const rankedNode = node as RankedEffectNode;
  return rankedNode.priority ?? rankedNode.rank ?? 0;
}

function ensureRankedCapacity(core: RankedSchedulerCore, priority: number): void {
  const heads = core.rankedHeads;
  if (priority < heads.length) return;
  heads.length = priority + 1;
}

function detachRankedNode(node: RankedEffectNode): void {
  node.prevRanked = node;
  node.nextRanked = undefined;
}

function pushPendingNode(core: RankedSchedulerCore, effectNode: EffectNode): void {
  const node = effectNode as RankedEffectNode;
  const priority = getNodePriority(node);
  ensureRankedCapacity(core, priority);
  const head = core.rankedHeads[priority];

  node.rankedPriority = priority;
  if (head === undefined) {
    node.prevRanked = node;
    node.nextRanked = undefined;
    core.rankedHeads[priority] = node;
  } else {
    const tail = head.prevRanked;
    tail.nextRanked = node;
    node.prevRanked = tail;
    node.nextRanked = undefined;
    head.prevRanked = node;
  }

  if (priority < core.minPriority) core.minPriority = priority;
  if (priority > core.maxPriority) core.maxPriority = priority;
}

function resetPendingBuckets(core: RankedSchedulerCore): void {
  core.rankedHeads.length = 0;
  core.minPriority = 0;
  core.maxPriority = -1;
}

function rankedFlush(this: RankedSchedulerCore): void {
  const queue = this.queue;
  if (this.phase === SchedulerPhase.Flushing) return;
  if (queue.size === 0) return;

  this.phase = SchedulerPhase.Flushing;
  let processedPriority = 0;
  let processedNode: RankedEffectNode | undefined;
  let thrown: unknown = null;

  try {
    while (queue.size !== 0 || this.maxPriority >= this.minPriority) {
      resetPendingBuckets(this);
      processedNode = undefined;

      while (queue.size !== 0) {
        pushPendingNode(this, shiftWatcherQueue(queue)!);
      }

      for (
        processedPriority = this.maxPriority;
        processedPriority >= this.minPriority;
        --processedPriority
      ) {
        let node = this.rankedHeads[processedPriority];
        if (node === undefined) continue;
        const head = node;

        do {
          processedNode = node;
          const next: RankedEffectNode = node.nextRanked ?? head;
          node.state &= UNSCHEDULE_MASK;
          try {
            runWatcher(node);
          } catch (error) {
            if (thrown === null) {
              thrown = error;
            }
          }

          detachRankedNode(node);
          node = next !== processedNode ? next : undefined;
        } while (node !== undefined && node !== head);
      }
    }
  } finally {
    unschedulePendingNodes(
      this.rankedHeads,
      processedPriority,
      processedNode,
    );
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
  core.minPriority = 0;
  core.maxPriority = -1;
  core.flush = rankedFlush;
  const enqueue = (node: ReactiveNode): void => {
    tryEnqueue(core.queue, node);
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
