import {
  DIRTY_STATE,
  ReactiveNodeState,
  runWatcher,
  getDefaultContext,
} from "@reflex/runtime";
import type { ExecutionContext, ReactiveNode } from "@reflex/runtime";
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

function noopNotifySettled(): void {}

export function createEffectScheduler(
  mode: EffectSchedulerMode = EffectSchedulerMode.Flush,
  context?: ExecutionContext,
): EffectScheduler {
  const queue: ReactiveNode<typeof UNINITIALIZED | Destructor>[] = [];
  const eager = mode === EffectSchedulerMode.Eager;
  const getContext = context === undefined ? getDefaultContext : () => context;

  let head = 0;
  let batchDepth = 0;
  let phase = SchedulerPhase.Idle;

  function enqueueFlush(node: ReactiveNode): void {
    const state = node.state;
    if (
      (state & (ReactiveNodeState.Disposed | ReactiveNodeState.Scheduled)) !==
      0
    ) {
      return;
    }

    node.state = state | ReactiveNodeState.Scheduled;
    queue.push(node);
  }

  function enqueueEager(node: ReactiveNode): void {
    const state = node.state;
    if (
      (state & (ReactiveNodeState.Disposed | ReactiveNodeState.Scheduled)) !==
      0
    ) {
      return;
    }

    node.state = state | ReactiveNodeState.Scheduled;
    queue.push(node);

    const currentContext = getContext();
    if (
      phase === SchedulerPhase.Idle &&
      batchDepth === 0 &&
      currentContext.propagationDepth === 0 &&
      currentContext.activeComputed === null
    ) {
      flushQueue();
    }
  }

  function enterBatch(): void {
    if (++batchDepth === 1 && phase !== SchedulerPhase.Flushing) {
      phase = SchedulerPhase.Batching;
    }
  }

  function leaveBatchFlush(): void {
    if (--batchDepth !== 0) return;
    if (phase === SchedulerPhase.Flushing) return;

    phase = SchedulerPhase.Idle;
  }

  function leaveBatchEager(): void {
    if (--batchDepth !== 0) return;
    if (phase === SchedulerPhase.Flushing) return;

    phase = SchedulerPhase.Idle;

    if (head < queue.length) {
      flushQueue();
    }
  }

  const enqueue = eager ? enqueueEager : enqueueFlush;
  const leaveBatch = eager ? leaveBatchEager : leaveBatchFlush;

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
      const state = node.state & ~ReactiveNodeState.Scheduled;
      node.state = state;

      if (
        (state & ReactiveNodeState.Disposed) === 0 &&
        (state & DIRTY_STATE) !== 0
      ) {
        runWatcher(node);
      }
    }
  }

  function flushQueue(): void {
    if (phase === SchedulerPhase.Flushing) return;
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

  function notifySettledEager(): void {
    const currentContext = getContext();
    if (
      phase === SchedulerPhase.Idle &&
      batchDepth === 0 &&
      currentContext.propagationDepth === 0 &&
      currentContext.activeComputed === null &&
      head < queue.length
    ) {
      flushQueue();
    }
  }

  const flush = flushQueue;
  const notifySettled = eager ? notifySettledEager : noopNotifySettled;

  function reset(): void {
    for (let i = head; i < queue.length; ++i) {
      queue[i]!.state &= ~ReactiveNodeState.Scheduled;
    }

    queue.length = 0;
    head = 0;
    batchDepth = 0;
    phase = SchedulerPhase.Idle;
  }

  return {
    queue,
    mode,
    get context() {
      return getContext();
    },
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
