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

    try {
      while (queue.size !== 0) {
        pending.push(queue.shift()!);
      }

      pending.sort((left, right) => getNodeRank(right) - getNodeRank(left));

      for (let i = 0; i < pending.length; ++i) {
        const node = pending[i]!,
          s = node.state;
        node.state = s & UNSCHEDULE_MASK;
        runner(node);
      }
    } finally {
      queue.clear();
      phase = batchDepth > 0 ? SchedulerPhase.Batching : SchedulerPhase.Idle;
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
