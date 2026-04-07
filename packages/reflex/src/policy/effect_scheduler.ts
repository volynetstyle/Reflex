import {
  DIRTY_STATE,
  ReactiveNodeState,
  runWatcher,
  getDefaultContext,
} from "@reflex/runtime";
import type { ExecutionContext, ReactiveNode } from "@reflex/runtime";
import { effectScheduled, effectUnscheduled } from "../api/effect";
import type { UNINITIALIZED } from "../infra/factory";

export const enum EffectSchedulerMode {
  Flush = 0,
  Eager = 1,
}

export const enum SchedulerPhase {
  Idle = 0,
  Batching = 1,
  Flushing = 2,
}

export type EffectStrategy = "flush" | "eager";

export function resolveEffectSchedulerMode(
  strategy: EffectStrategy | undefined,
): EffectSchedulerMode {
  return strategy === "eager"
    ? EffectSchedulerMode.Eager
    : EffectSchedulerMode.Flush;
}

export interface EffectScheduler {
  readonly queue: ReactiveNode<typeof UNINITIALIZED | Destructor>[];
  readonly mode: EffectSchedulerMode;
  readonly context: ExecutionContext;

  enqueue(node: ReactiveNode): void;
  batch<T>(fn: () => T): T;
  flush(): void;
  notifySettled(): void;
  reset(): void;

  get head(): number;
  get batchDepth(): number;
  get phase(): SchedulerPhase;
}

export function createEffectScheduler(
  mode: EffectSchedulerMode = EffectSchedulerMode.Flush,
  context: ExecutionContext = getDefaultContext(),
): EffectScheduler {
  const queue: ReactiveNode<typeof UNINITIALIZED | Destructor>[] = [];

  let head = 0;
  let batchDepth = 0;
  let phase = SchedulerPhase.Idle;

  function isIdle(): boolean {
    return (
      phase === SchedulerPhase.Idle &&
      batchDepth === 0 &&
      context.propagationDepth === 0 &&
      context.activeComputed === null
    );
  }

  function enqueue(node: ReactiveNode): void {
    if (
      (node.state &
        (ReactiveNodeState.Disposed | ReactiveNodeState.Scheduled)) !==
      0
    ) {
      return;
    }

    effectScheduled(node);
    queue.push(node);

    if (mode === EffectSchedulerMode.Eager && isIdle()) {
      flushEager();
    }
  }

  function enterBatch(): void {
    if (++batchDepth === 1 && phase !== SchedulerPhase.Flushing) {
      phase = SchedulerPhase.Batching;
    }
  }

  function leaveBatch(): void {
    if (--batchDepth !== 0) return;
    if (phase === SchedulerPhase.Flushing) return;

    phase = SchedulerPhase.Idle;

    if (mode === EffectSchedulerMode.Eager && head < queue.length) {
      flushEager();
    }
  }

  function batch<T>(fn: () => T): T {
    enterBatch();
    try {
      return fn();
    } finally {
      leaveBatch();
    }
  }

  function drainQueue(): void {
    while (head < queue.length) {
      const node = queue[head++]!;
      effectUnscheduled(node);

      if (
        (node.state & ReactiveNodeState.Disposed) === 0 &&
        (node.state & DIRTY_STATE) !== 0
      ) {
        runWatcher(node);
      }
    }
  }

  function flushEager(): void {
    if (phase !== SchedulerPhase.Idle) return;
    if (head >= queue.length) return;

    phase = SchedulerPhase.Flushing;

    try {
      drainQueue();
    } finally {
      queue.length = 0;
      head = 0;
      phase = batchDepth > 0 ? SchedulerPhase.Batching : SchedulerPhase.Idle;
    }
  }

  function flush(): void {
    if (mode === EffectSchedulerMode.Eager) {
      flushEager();
      return;
    }

    if (phase !== SchedulerPhase.Idle) return;
    if (head >= queue.length) return;

    phase = SchedulerPhase.Flushing;

    try {
      drainQueue();
    } finally {
      queue.length = 0;
      head = 0;
      phase = batchDepth > 0 ? SchedulerPhase.Batching : SchedulerPhase.Idle;
    }
  }

  function notifySettled(): void {
    if (mode === EffectSchedulerMode.Eager) {
      if (isIdle() && head < queue.length) {
        flushEager();
      }
      return;
    }

    // flush mode: do nothing automatically
  }

  function reset(): void {
    for (let i = head; i < queue.length; ++i) {
      effectUnscheduled(queue[i]!);
    }

    queue.length = 0;
    head = 0;
    batchDepth = 0;
    phase = SchedulerPhase.Idle;
  }

  return {
    queue,
    mode,
    context,
    enqueue,
    batch,
    flush,
    notifySettled,
    reset,
    get head() {
      return head;
    },
    get batchDepth() {
      return batchDepth;
    },
    get phase() {
      return phase;
    },
  };
}
