import type { ExecutionContext } from "@reflex/runtime";
import { EffectSchedulerMode } from "../scheduler.constants";
import {
  createSchedulerCore,
  isRuntimeInactive,
  createSchedulerInstance,
  tryEnqueue,
} from "../scheduler.core";
import type { EffectNode, EffectScheduler } from "../scheduler.types";

export function createEagerScheduler(
  context: ExecutionContext,
): EffectScheduler {
  const core = createSchedulerCore();
  const queue = core.queue;
  const notifySettled = (): void => {
    if (isRuntimeInactive(context, core) && queue.size !== 0) {
      core.flush();
    }
  };
  const enqueueToQueue = tryEnqueue.bind(null, queue);
  const enqueue = (node: EffectNode) => {
    if (!enqueueToQueue(node)) return;
    if (isRuntimeInactive(context, core)) core.flush();
  };
  const batch = <T>(fn: () => T): T => {
    core.enterBatch();
    try {
      return fn();
    } finally {
      if (core.leaveBatch() && queue.size !== 0) {
        core.flush();
      }
    }
  };

  return createSchedulerInstance(
    EffectSchedulerMode.Eager,
    context,
    core,
    enqueue,
    batch,
    notifySettled,
    notifySettled,
  );
}
