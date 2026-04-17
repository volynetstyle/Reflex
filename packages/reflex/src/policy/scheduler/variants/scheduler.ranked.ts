import type { ExecutionContext, ReactiveNode } from "@reflex/runtime";
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
};

type RankedSchedulerCore = SchedulerCore & {
  pending: EffectNode[];
};

function unscheduleQueuedNodes(queue: RankedSchedulerCore["queue"]): void {
  while (queue.size !== 0) {
    shiftWatcherQueue(queue)!.state &= UNSCHEDULE_MASK;
  }

  clearWatcherQueue(queue);
}

function unschedulePendingNodes(
  pending: readonly EffectNode[],
  startIndex: number,
): void {
  for (let i = startIndex; i < pending.length; ++i) {
    pending[i]!.state &= UNSCHEDULE_MASK;
  }
}

function getNodeRank(node: EffectNode): number {
  const rankedNode = node as RankedEffectNode;
  return rankedNode.priority ?? rankedNode.rank ?? 0;
}

function compareNodeRank(left: EffectNode, right: EffectNode): number {
  return getNodeRank(right) - getNodeRank(left);
}

function rankedFlush(this: RankedSchedulerCore): void {
  const queue = this.queue;
  if (this.phase === SchedulerPhase.Flushing) return;
  if (queue.size === 0) return;

  this.phase = SchedulerPhase.Flushing;
  const pending = this.pending;
  pending.length = 0;
  let processed = 0;
  let thrown: unknown = null;

  try {
    while (queue.size !== 0) {
      pending.push(shiftWatcherQueue(queue)!);
    }

    pending.sort(compareNodeRank);

    for (; processed < pending.length; ++processed) {
      const node = pending[processed]!;
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
    unschedulePendingNodes(pending, processed);
    pending.length = 0;
    unscheduleQueuedNodes(queue);
    this.phase =
      this.batchDepth > 0 ? SchedulerPhase.Batching : SchedulerPhase.Idle;
  }

  if (thrown !== null) {
    throw thrown;
  }
}

export function createRankedScheduler(
  context: ExecutionContext,
): EffectScheduler {
  const core = createSchedulerCore() as RankedSchedulerCore;
  core.pending = [];
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
    context,
    core,
    enqueue,
    batch,
    noopNotifySettled,
    undefined,
  );
}
