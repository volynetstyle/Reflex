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

const SCHEDULED_DISPOSED =
  ReactiveNodeState.Disposed | ReactiveNodeState.Scheduled;
const INITIAL_QUEUE_CAPACITY = 16;

export function createEffectScheduler(
  mode: EffectSchedulerMode = EffectSchedulerMode.Flush,
  context?: ExecutionContext,
): EffectScheduler {
  let head = 0;
  let tail = 0;
  let size = 0;

  const queue: ReactiveNode<typeof UNINITIALIZED | Destructor>[] = [];
  const eager = mode === EffectSchedulerMode.Eager;
  const getContext = context === undefined ? getDefaultContext : () => context;

  let batchDepth = 0;
  let phase = SchedulerPhase.Idle;

  function hasPending(): boolean {
    return size !== 0;
  }

  function growQueue(): void {
    const capacity = queue.length;
    const nextCapacity =
      capacity === 0 ? INITIAL_QUEUE_CAPACITY : capacity << 1;

    const nextQueue = new Array<
      ReactiveNode<typeof UNINITIALIZED | Destructor>
    >(nextCapacity);

    for (let i = 0; i < size; ++i) {
      nextQueue[i] = queue[(head + i) % capacity]!;
    }

    queue.length = nextCapacity;
    for (let i = 0; i < size; ++i) {
      queue[i] = nextQueue[i]!;
    }

    head = 0;
    tail = size;
  }

  function push(node: ReactiveNode<typeof UNINITIALIZED | Destructor>): void {
    if (size === queue.length) {
      growQueue();
    }

    queue[tail] = node;
    tail = (tail + 1) % queue.length;
    ++size;
  }

  function shift(): ReactiveNode<typeof UNINITIALIZED | Destructor> | null {
    if (size === 0) {
      return null;
    }

    const node = queue[head]!;
    queue[head] = undefined as never;
    head = (head + 1) % queue.length;
    --size;
    return node;
  }

  function enqueueFlush(node: ReactiveNode): void {
    const state = node.state;
    if ((state & SCHEDULED_DISPOSED) !== 0) {
      return;
    }

    node.state = state | ReactiveNodeState.Scheduled;
    push(node);
  }

  function enqueueEager(node: ReactiveNode): void {
    const state = node.state;
    if ((state & SCHEDULED_DISPOSED) !== 0) {
      return;
    }

    node.state = state | ReactiveNodeState.Scheduled;
    push(node);

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

    if (hasPending()) {
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

  function flushQueue(): void {
    if (phase === SchedulerPhase.Flushing) return;
    if (!hasPending()) return;

    phase = SchedulerPhase.Flushing;

    try {
      while (size !== 0) {
        const node = shift()!;
        const state = node.state & ~ReactiveNodeState.Scheduled;
        node.state = state;

        if (
          (state & ReactiveNodeState.Disposed) === 0 &&
          (state & DIRTY_STATE) !== 0
        ) {
          runWatcher(node);
        }
      }
    } finally {
      head = tail = size = 0;
      phase = batchDepth > 0 ? SchedulerPhase.Batching : SchedulerPhase.Idle;
    }
  }

  function notifySettledEager(): void {
    const currentContext = getContext();
    const inactive =
      phase === SchedulerPhase.Idle &&
      batchDepth === 0 &&
      currentContext.propagationDepth === 0 &&
      currentContext.activeComputed === null;

    if (inactive && hasPending()) {
      flushQueue();
    }
  }

  const flush = flushQueue;
  const notifySettled = eager ? notifySettledEager : noopNotifySettled;

  function reset(): void {
    while (size !== 0) {
      shift()!.state &= ~ReactiveNodeState.Scheduled;
    }

    head = tail = size = batchDepth = 0;
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
