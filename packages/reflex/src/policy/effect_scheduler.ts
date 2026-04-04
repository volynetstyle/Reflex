import {
  DIRTY_STATE,
  ReactiveNodeState,
  runWatcher,
  getDefaultContext,
} from "@reflex/runtime";
import type { ExecutionContext } from "@reflex/runtime";
import {
  effectScheduled,
  effectUnscheduled,
  isEffectScheduled,
} from "../api/effect";
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

const SETTLED_NEXT = Symbol("reflex.settled_next");

type ScheduledReactiveNode = ReactiveNode & {
  [SETTLED_NEXT]?: ReactiveNode | null;
};

export function resolveEffectSchedulerMode(
  strategy: EffectStrategy | undefined,
): EffectSchedulerMode {
  return strategy === "eager"
    ? EffectSchedulerMode.Eager
    : EffectSchedulerMode.Flush;
}

export class EffectScheduler {
  private readonly queue: ReactiveNode<typeof UNINITIALIZED | Destructor>[] = [];
  private head = 0;
  private batchDepth = 0;
  private phase = SchedulerPhase.Idle;

  private currentNode: ReactiveNode | null = null;

  private settledHead: ReactiveNode | null = null;
  private settledTail: ReactiveNode | null = null;

  private readonly ctx: ExecutionContext;

  constructor(
    private readonly mode: EffectSchedulerMode,
    context?: ExecutionContext,
  ) {
    this.ctx = context ?? getDefaultContext();
  }

  scheduleInvalidated(node: ReactiveNode): boolean {
    if (this.isNodeIgnored(node)) return false;
    if ((node.state & DIRTY_STATE) === 0) return false;

    if (this.canRunImmediately(node)) {
      this.runImmediately(node);
      return true;
    }

    this.enqueue(node);
    return true;
  }

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
    if (this.phase === SchedulerPhase.Flushing) return;
    if (!this.hasPending()) return;

    this.phase = SchedulerPhase.Flushing;
    let completed = false;

    try {
      while (this.head < this.queue.length) {
        const node = this.queue[this.head++]!;
        this.runQueuedNode(node);
      }

      completed = true;
    } finally {
      if (completed) {
        this.queue.length = 0;
        this.head = 0;
      } else if (this.head > 0) {
        // сохранить хвост очереди после throw
        this.queue.copyWithin(0, this.head);
        this.queue.length -= this.head;
        this.head = 0;
      }

      this.phase =
        this.batchDepth > 0 ? SchedulerPhase.Batching : SchedulerPhase.Idle;

      // settled effects переводим в обычную очередь только после завершения flush
      if (this.phase === SchedulerPhase.Idle && this.settledHead !== null) {
        this.drainSettledIntoMainQueue();
      }

      /* c8 ignore start */
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
    this.currentNode = null;
    this.clearSettledQueue();
  }

  notifySettled(): void {
    if (this.settledHead !== null) {
      this.drainSettledIntoMainQueue();
    }

    if (this.shouldAutoFlush()) {
      this.flush();
    }
  }

  isFlushing(): boolean {
    return this.phase === SchedulerPhase.Flushing;
  }

  isRunning(node: ReactiveNode): boolean {
    return this.currentNode === node;
  }

  deferUntilSettled(node: ReactiveNode): void {
    if ((node.state & ReactiveNodeState.Disposed) !== 0) return;
    if (isEffectScheduled(node)) return;

    effectScheduled(node);

    const scheduledNode = node as ScheduledReactiveNode;
    scheduledNode[SETTLED_NEXT] = null;

    if (this.settledTail === null) {
      this.settledHead = node;
    } else {
      (this.settledTail as ScheduledReactiveNode)[SETTLED_NEXT] = node;
    }

    this.settledTail = node;
  }

  canRunImmediately(node: ReactiveNode): boolean {
    return (
      (node.state & DIRTY_STATE) !== 0 &&
      this.mode === EffectSchedulerMode.Eager &&
      this.phase === SchedulerPhase.Idle &&
      this.batchDepth === 0 &&
      this.ctx.propagationDepth === 0 &&
      this.ctx.activeComputed === null
    );
  }

  canDeferUntilSettled(node: ReactiveNode): boolean {
    return (
      (node.state & DIRTY_STATE) !== 0 &&
      this.mode === EffectSchedulerMode.Eager &&
      this.phase === SchedulerPhase.Idle &&
      this.batchDepth === 0 &&
      this.ctx.propagationDepth !== 0 &&
      this.ctx.activeComputed === null
    );
  }

  private hasPending(): boolean {
    return this.head < this.queue.length;
  }

  private runImmediately(node: ReactiveNode): void {
    effectScheduled(node);

    let threw = false;
    let thrown: unknown;

    this.currentNode = node;
    try {
      runWatcher(node, this.ctx);
    } catch (error) {
      threw = true;
      thrown = error;
    } finally {
      this.currentNode = null;
    }

    if (threw) {
      effectUnscheduled(node);
      throw thrown;
    }

    this.finishOwnedNode(node);

    if (this.shouldAutoFlush()) {
      this.flush();
    }
  }

  private runQueuedNode(node: ReactiveNode): void {
    if (this.shouldSkipNode(node)) {
      effectUnscheduled(node);
      return;
    }

    let threw = false;
    let thrown: unknown;

    this.currentNode = node;
    try {
      runWatcher(node, this.ctx);
    } catch (error) {
      threw = true;
      thrown = error;
    } finally {
      this.currentNode = null;
    }

    if (threw) {
      effectUnscheduled(node);
      throw thrown;
    }

    this.finishOwnedNode(node);
  }

  private finishOwnedNode(node: ReactiveNode): void {
    if (this.shouldSkipNode(node)) {
      effectUnscheduled(node);
      return;
    }

    this.queue.push(node);
  }

  private isNodeIgnored(node: ReactiveNode): boolean {
    return (
      (node.state & ReactiveNodeState.Disposed) !== 0 ||
      isEffectScheduled(node)
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
      this.ctx.propagationDepth === 0 &&
      this.ctx.activeComputed === null &&
      this.hasPending()
    );
  }

  private drainSettledIntoMainQueue(): void {
    let node = this.settledHead;
    this.settledHead = null;
    this.settledTail = null;

    while (node !== null) {
      const scheduledNode = node as ScheduledReactiveNode;
      const next = scheduledNode[SETTLED_NEXT] ?? null;
      scheduledNode[SETTLED_NEXT] = null;
      this.queue.push(node);
      node = next;
    }
  }

  private clearSettledQueue(): void {
    let node = this.settledHead;
    this.settledHead = null;
    this.settledTail = null;

    while (node !== null) {
      const scheduledNode = node as ScheduledReactiveNode;
      const next = scheduledNode[SETTLED_NEXT] ?? null;
      scheduledNode[SETTLED_NEXT] = null;
      effectUnscheduled(node);
      node = next;
    }
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

    if (this.settledHead !== null) {
      this.drainSettledIntoMainQueue();
    }

    if (this.shouldAutoFlush()) {
      this.flush();
    }
  }
}
