import {
  DIRTY_STATE,
  ReactiveNodeState,
  runWatcher,
} from "@reflex/runtime";
import { effectScheduled, effectUnscheduled } from "../api/effect";
import { UNINITIALIZED } from "../infra/factory";
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
  private readonly queue: ReactiveNode<typeof UNINITIALIZED | Destructor>[] =
    [];
  private head = 0;
  private batchDepth = 0;
  private phase = SchedulerPhase.Idle;

  constructor(private readonly mode: EffectSchedulerMode) {}

  enqueue(node: ReactiveNode): void {
    if (this.isNodeIgnored(node)) return;

    effectScheduled(node);
    this.queue.push(node);

    if (this.shouldAutoFlush()) {
      this.flush();
    }
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
    if (this.phase & SchedulerPhase.Flushing) return;
    if (!this.hasPending()) return;

    this.phase = SchedulerPhase.Flushing;

    try {
      while (this.head < this.queue.length) {
        const node = this.queue[this.head++]!;
        effectUnscheduled(node);

        if (this.shouldSkipNode(node)) continue;

        runWatcher(node);
      }
    } finally {
      this.queue.length = 0;
      this.head = 0;
      this.phase =
        this.batchDepth > 0 ? SchedulerPhase.Batching : SchedulerPhase.Idle;

      /* c8 ignore start -- the queue is fully drained before reaching this branch */
      if (this.phase === SchedulerPhase.Idle && this.shouldAutoFlush()) {
        this.flush();
      }
      /* c8 ignore stop */
    }
  }

  reset(): void {
    this.queue.length = 0;
    this.head = 0;
    this.batchDepth = 0;
    this.phase = SchedulerPhase.Idle;
  }

  private hasPending(): boolean {
    return this.head < this.queue.length;
  }

  private isNodeIgnored(node: ReactiveNode): boolean {
    return (
      (node.state & ReactiveNodeState.Disposed) !== 0 ||
      (node.state & ReactiveNodeState.Scheduled) !== 0
    );
  }

  private shouldSkipNode(node: ReactiveNode): boolean {
    return (
      (node.state & ReactiveNodeState.Disposed) !== 0 ||
      (node.state & DIRTY_STATE) === 0
    );
  }

  private shouldAutoFlush(): boolean {
    return (
      this.mode === EffectSchedulerMode.Eager &&
      this.phase === SchedulerPhase.Idle &&
      this.hasPending()
    );
  }

  private enterBatch(): void {
    ++this.batchDepth;

    if (this.phase !== SchedulerPhase.Flushing) {
      this.phase = SchedulerPhase.Batching;
    }
  }

  private leaveBatch(): void {
    --this.batchDepth;

    if (this.batchDepth !== 0) return;
    if (this.phase === SchedulerPhase.Flushing) return;

    this.phase = SchedulerPhase.Idle;

    if (this.shouldAutoFlush()) {
      this.flush();
    }
  }
}
