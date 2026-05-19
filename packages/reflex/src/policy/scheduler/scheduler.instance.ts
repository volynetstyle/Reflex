import type { EffectSchedulerMode } from "./scheduler.constants";
import type {
  EffectScheduler,
  QueueBacked,
  SchedulerBatch,
  SchedulerCore,
  SchedulerEnqueue,
  SchedulerNotifySettled,
  SchedulerRuntimeNotifySettled,
} from "./scheduler.types";

export function attachQueueState<TInstance extends object, TItem>(
  target: TInstance,
  queue: QueueBacked<TItem>["queue"],
): TInstance & Pick<QueueBacked<TItem>, "ring" | "head"> {
  const instance = target as TInstance & Pick<QueueBacked<TItem>, "ring" | "head">;

  Object.defineProperty(instance, "ring", {
    configurable: true,
    enumerable: true,
    get: (): Array<TItem | undefined> => queue.ring,
  });

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
