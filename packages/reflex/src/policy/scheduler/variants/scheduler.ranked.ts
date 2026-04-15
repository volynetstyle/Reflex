import type { ExecutionContext } from "@reflex/runtime";
import { runWatcher } from "@reflex/runtime";
import {
  EffectSchedulerMode,
  SchedulerPhase,
  UNSCHEDULE_MASK,
} from "../scheduler.constants";
import { createSchedulerInstance, tryEnqueue } from "../scheduler.core";
import { createWatcherQueue } from "../scheduler.queue";
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

const runner = runWatcher.bind(null);

function unscheduleQueuedNodes(queue: ReturnType<typeof createWatcherQueue>): void {
  while (queue.size !== 0) {
    queue.shift()!.state &= UNSCHEDULE_MASK;
  }

  queue.clear();
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

export function createRankedScheduler(
  context: ExecutionContext,
): EffectScheduler {
  const queue = createWatcherQueue();
  let batchDepth = 0;
  let phase = SchedulerPhase.Idle;

  const flush = (): void => {
    if (phase === SchedulerPhase.Flushing) return;
    if (queue.size === 0) return;

    phase = SchedulerPhase.Flushing;
    const pending: EffectNode[] = [];
    let processed = 0;
    let thrown: unknown = null;

    try {
      while (queue.size !== 0) {
        pending.push(queue.shift()!);
      }

      pending.sort((left, right) => getNodeRank(right) - getNodeRank(left));

      for (; processed < pending.length; ++processed) {
        const node = pending[processed]!,
          s = node.state;
        node.state = s & UNSCHEDULE_MASK;
        try {
          runner(node);
        } catch (error) {
          if (thrown === null) {
            thrown = error;
          }
        }
      }
    } finally {
      unschedulePendingNodes(pending, processed);
      unscheduleQueuedNodes(queue);
      phase = batchDepth > 0 ? SchedulerPhase.Batching : SchedulerPhase.Idle;
    }

    if (thrown !== null) {
      throw thrown;
    }
  };

  const core: SchedulerCore = {
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
      unscheduleQueuedNodes(queue);
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

  const enqueue = tryEnqueue.bind(null, queue);
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
