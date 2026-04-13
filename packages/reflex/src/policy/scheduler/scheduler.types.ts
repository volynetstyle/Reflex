import type { ExecutionContext, ReactiveNode } from "@reflex/runtime";
import type {
  EffectSchedulerMode,
  SchedulerPhase,
} from "./scheduler.constants";

export type EffectNode = ReactiveNode<undefined | Destructor>;

export interface WatcherQueue {
  readonly ring: EffectNode[];
  head: number;
  tail: number;
  size: number;

  push(node: EffectNode): void;
  shift(): EffectNode | null;
  clear(): void;
}

export function noopNotifySettled(): void {}

export interface SchedulerCore {
  readonly queue: WatcherQueue;
  flush(): void;
  enterBatch(): void;
  leaveBatch(): boolean;
  reset(): void;

  get batchDepth(): number;
  get phase(): SchedulerPhase;
}

export interface EffectScheduler {
  readonly ring: EffectNode[];
  readonly mode: EffectSchedulerMode;
  readonly context: ExecutionContext;
  readonly runtimeNotifySettled: (() => void) | undefined;

  enqueue(node: ReactiveNode): void;
  batch<T>(fn: () => T): T;
  flush(): void;
  notifySettled(): void;
  reset(): void;

  get head(): number;
  get batchDepth(): number;
  get phase(): SchedulerPhase;
}

export type SchedulerBatch = EffectScheduler["batch"];
export type SchedulerEnqueue = EffectScheduler["enqueue"];
export type SchedulerNotifySettled = EffectScheduler["notifySettled"];
export type SchedulerRuntimeNotifySettled =
  EffectScheduler["runtimeNotifySettled"];
