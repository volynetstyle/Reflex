import {
  ReactiveNodeState,
  runWatcher,
  getDefaultContext,
} from "@reflex/runtime";
import type { ExecutionContext, ReactiveNode } from "@reflex/runtime";
import type { UNINITIALIZED } from "../infra/factory";

/**
 * Marks an effect watcher node as scheduled.
 *
 * This is a low-level helper used by scheduler integrations and tests to set
 * the runtime's scheduled flag on a watcher node.
 */
export function effectScheduled(
  node: ReactiveNode<typeof UNINITIALIZED | Destructor>,
) {
  const s = node.state;
  node.state = s | ReactiveNodeState.Scheduled;
}

/**
 * Clears the scheduled flag from an effect watcher node.
 *
 * This is a low-level helper used by scheduler integrations and tests to mark
 * a watcher as no longer queued for execution.
 */
export function effectUnscheduled(
  node: ReactiveNode<typeof UNINITIALIZED | Destructor>,
) {
  const s = node.state;
  node.state = s & ~ReactiveNodeState.Scheduled;
}

export const enum EffectSchedulerMode {
  Flush = 0,
  Eager = 1,
  SAB = 2,
}

export const enum SchedulerPhase {
  Idle = 0,
  Batching = 1,
  Flushing = 2,
}

export type EffectStrategy = "flush" | "eager" | "sab";

export function resolveEffectSchedulerMode(
  strategy: EffectStrategy | undefined,
): EffectSchedulerMode {
  return strategy === "eager"
    ? EffectSchedulerMode.Eager
    : strategy === "sab"
      ? EffectSchedulerMode.SAB
      : EffectSchedulerMode.Flush;
}

export interface EffectScheduler {
  readonly ring: ReactiveNode<typeof UNINITIALIZED | Destructor>[];
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

const SCHEDULED_OR_DISPOSED =
  ReactiveNodeState.Disposed | ReactiveNodeState.Scheduled;
const INITIAL_QUEUE_CAPACITY = 16;

export function createEffectScheduler(
  mode: EffectSchedulerMode = EffectSchedulerMode.Flush,
  context?: ExecutionContext,
): EffectScheduler {
  let head = 0;
  let tail = 0;
  let size = 0;

  const ring: ReactiveNode<typeof UNINITIALIZED | Destructor>[] = [];
  const eager = mode === EffectSchedulerMode.Eager;
  const sab = mode === EffectSchedulerMode.SAB;
  const getContext = context === undefined ? getDefaultContext : () => context;

  let batchDepth = 0;
  let phase = SchedulerPhase.Idle;

  function hasPending(): boolean {
    return size !== 0;
  }

  function growQueue(): void {
    const capacity = ring.length;
    const nextCapacity =
      capacity === 0 ? INITIAL_QUEUE_CAPACITY : capacity << 1;

    const nextQueue = new Array<
      ReactiveNode<typeof UNINITIALIZED | Destructor>
    >(nextCapacity);

    for (let i = 0; i < size; ++i) {
      nextQueue[i] = ring[(head + i) % capacity]!;
    }

    ring.length = nextCapacity;
    for (let i = 0; i < size; ++i) {
      ring[i] = nextQueue[i]!;
    }

    head = 0;
    tail = size;
  }

  function push(node: ReactiveNode<typeof UNINITIALIZED | Destructor>): void {
    if (size === ring.length) {
      growQueue();
    }

    ring[tail] = node;
    tail = (tail + 1) % ring.length;
    ++size;
  }

  function shift(): ReactiveNode<typeof UNINITIALIZED | Destructor> | null {
    if (size === 0) {
      return null;
    }

    const node = ring[head]!;
    ring[head] = undefined as never;
    head = (head + 1) % ring.length;
    --size;
    return node;
  }

  function enqueueFlush(node: ReactiveNode): void {
    const state = node.state;
    if ((state & SCHEDULED_OR_DISPOSED) !== 0) {
      return;
    }

    effectScheduled(node);
    push(node);
  }

  function enqueueEager(node: ReactiveNode): void {
    const state = node.state;
    if ((state & SCHEDULED_OR_DISPOSED) !== 0) {
      return;
    }

    effectScheduled(node);
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

  function leaveBatchSAB(): void {
    if (--batchDepth !== 0) return;
    if (phase === SchedulerPhase.Flushing) return;

    phase = SchedulerPhase.Idle;

    if (!hasPending()) {
      return;
    }

    const currentContext = getContext();
    if (
      currentContext.propagationDepth === 0 &&
      currentContext.activeComputed === null
    ) {
      flushQueue();
    }
  }

  const enqueue = eager ? enqueueEager : enqueueFlush;
  const leaveBatch = eager
    ? leaveBatchEager
    : sab
      ? leaveBatchSAB
      : leaveBatchFlush;

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
        effectUnscheduled(node);
        // if (
        //   (state & ReactiveNodeState.Disposed) === 0 &&
        //   (state & DIRTY_STATE) !== 0
        // ) must be there but already guaranties by runWatcher {}
        runWatcher(node);
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
    ring,
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
