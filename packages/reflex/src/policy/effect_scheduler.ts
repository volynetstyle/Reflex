import {
  DIRTY_STATE,
  ReactiveNodeState,
  runWatcher,
  getDefaultContext,
} from "@reflex/runtime";
import type { ExecutionContext } from "@reflex/runtime";
import { effectScheduled, effectUnscheduled } from "../api/effect";
import type { UNINITIALIZED } from "../infra/factory";
import type { ReactiveNode } from "@reflex/runtime";

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

export class EffectScheduler {
  readonly queue: (ReactiveNode<typeof UNINITIALIZED | Destructor> | undefined)[] = [];
  head = 0;
  batchDepth = 0;
  phase = SchedulerPhase.Idle;
  readonly mode: EffectSchedulerMode;
  readonly context: ExecutionContext;

  constructor(
    mode: EffectSchedulerMode,
    context: ExecutionContext = getDefaultContext(),
  ) {
    this.mode = mode;
    this.context = context;
  }

  enqueue(node: ReactiveNode): void {
    if ((node.state & (ReactiveNodeState.Disposed | ReactiveNodeState.Scheduled)) !== 0)
      return;

    if (this.mode === EffectSchedulerMode.Eager && this.isIdle()) {
      runWatcher(node);
      return;
    }

    effectScheduled(node);
    this.queue.push(node);
  }

  batch<T>(fn: () => T): T {
    this.enterBatch();
    try {
      return fn();
    } finally {
      this.leaveBatch();
    }
  }

  flush(): void {
    if (this.phase !== SchedulerPhase.Idle) return;
    if (this.head >= this.queue.length) return;

    this.phase = SchedulerPhase.Flushing;
    const q = this.queue;

    try {
      while (this.head < q.length) {
        const node = q[this.head]!;
        q[this.head++] = undefined; // освобождаем ссылку сразу → GC

        effectUnscheduled(node);

        if (
          (node.state & ReactiveNodeState.Disposed) === 0 &&
          (node.state & DIRTY_STATE) !== 0
        ) {
          runWatcher(node);
        }
      }
    } finally {
      // runWatcher бросил → доочищаем остаток: снимаем Scheduled, не запускаем
      while (this.head < q.length) {
        const node = q[this.head]!;
        q[this.head++] = undefined;
        effectUnscheduled(node);
      }
      q.length = 0;
      this.head = 0;
      this.phase = this.batchDepth > 0 ? SchedulerPhase.Batching : SchedulerPhase.Idle;
    }
  }

  notifySettled(): void {
    if (this.head < this.queue.length) this.flush();
  }

  reset(): void {
    const q = this.queue;
    for (let i = this.head; i < q.length; ++i) effectUnscheduled(q[i]!);
    q.length = 0;
    this.head = 0;
    this.batchDepth = 0;
    this.phase = SchedulerPhase.Idle;
  }

  private isIdle(): boolean {
    return (
      this.phase === SchedulerPhase.Idle &&
      this.context.propagationDepth === 0 &&
      this.context.activeComputed === null
    );
  }

  private enterBatch(): void {
    if (++this.batchDepth === 1 && this.phase !== SchedulerPhase.Flushing) {
      this.phase = SchedulerPhase.Batching;
    }
  }

  private leaveBatch(): void {
    if (--this.batchDepth !== 0) return;
    if (this.phase === SchedulerPhase.Flushing) return;

    this.phase = SchedulerPhase.Idle;
    if (this.mode === EffectSchedulerMode.Flush && this.head < this.queue.length) {
      this.flush();
    }
  }
}