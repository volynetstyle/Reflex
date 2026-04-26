import type { ReactiveNode } from "@volynets/reflex-runtime";
import type {
  EffectSchedulerMode,
  SchedulerPhase,
} from "./scheduler.constants";

export type EffectNode = ReactiveNode<undefined | Destructor>;

export interface RingQueue<T> {
  readonly ring: T[];
  head: number;
  tail: number;
  size: number;

  push(node: T): void;
  shift(): T | null;
  clear(): void;
}

export type WatcherQueue = RingQueue<EffectNode>;

export interface QueueBacked<T> {
  readonly queue: RingQueue<T>;
  readonly ring: T[];
  readonly head: number;
}

export function noopNotifySettled(): void {}

export interface SchedulerCore {
  readonly queue: WatcherQueue;
  readonly renderQueue: WatcherQueue;
  batchDepth: number;
  phase: SchedulerPhase;
  flush(): void;
  enterBatch(): void;
  leaveBatch(): boolean;
  reset(): void;
}

export interface EffectScheduler {
  readonly ring: EffectNode[];
  readonly mode: EffectSchedulerMode;
  readonly runtimeNotifySettled: (() => void) | undefined;

  enqueue(node: ReactiveNode): void;
  batch<T>(fn: () => T): T;
  flush(): void;
  notifySettled(): void;
  reset(): void;

  readonly head: number;
  readonly batchDepth: number;
  readonly phase: SchedulerPhase;
}

export type SchedulerBatch = EffectScheduler["batch"];
export type SchedulerEnqueue = EffectScheduler["enqueue"];
export type SchedulerNotifySettled = EffectScheduler["notifySettled"];
export type SchedulerRuntimeNotifySettled =
  EffectScheduler["runtimeNotifySettled"];
