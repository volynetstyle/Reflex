import type { ReactiveNode } from "@volynets/reflex-runtime/internal";
import type { EffectSchedulerMode } from "./scheduler.constants";

export type EffectNode = ReactiveNode<undefined | Destructor>;

export interface RingQueue<T> {
  ring: Array<T | undefined>;
  mask: number;
  head: number;
  tail: number;
}

export type WatcherQueue = RingQueue<EffectNode>;

export function noopNotifySettled(): void {}

export interface SchedulerCore {
  readonly queue: WatcherQueue;
  batchDepth: number;
  phase: number;
}

export interface EffectScheduler {
  readonly mode: EffectSchedulerMode;
  readonly core: SchedulerCore;
  readonly runtimeNotifySettled: (() => void) | undefined;

  enqueue(node: ReactiveNode): void;
  batch<T>(fn: () => T): T;
  flush(): void;
  notifySettled(): void;
  reset(): void;
}

export type SchedulerBatch = EffectScheduler["batch"];
export type SchedulerEnqueue = EffectScheduler["enqueue"];
export type SchedulerNotifySettled = EffectScheduler["notifySettled"];
export type SchedulerRuntimeNotifySettled =
  EffectScheduler["runtimeNotifySettled"];
