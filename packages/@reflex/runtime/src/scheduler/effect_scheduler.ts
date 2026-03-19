import { runEffect } from "../reactivity/engine/effect";
import {
  ReactiveNode,
  isDisposedState,
  isScheduledState,
  markNodeScheduled,
  clearNodeScheduled,
  isDirtyState,
} from "../reactivity/shape";

export const enum EffectSchedulerMode {
  Flush = 0,
  Eager = 1,
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
  private readonly queue: ReactiveNode[] = [];
  private head = 0;
  private flushing = false;

  constructor(private readonly mode: EffectSchedulerMode) {}

  enqueue(node: ReactiveNode): void {
    if (isDisposedState(node.state) || isScheduledState(node.state)) return;

    markNodeScheduled(node);
    this.queue.push(node);

    if (this.mode === EffectSchedulerMode.Eager && !this.flushing) {
      this.flush();
    }
  }

  flush(): void {
    if (this.flushing) return;

    this.flushing = true;

    try {
      while (this.head < this.queue.length) {
        const node = this.queue[this.head]!;
        ++this.head;
        clearNodeScheduled(node);

        if (isDisposedState(node.state) || !isDirtyState(node.state)) {
          continue;
        }

        runEffect(node);
      }
    } finally {
      this.queue.length = 0;
      this.head = 0;
      this.flushing = false;
    }
  }

  clear(node: ReactiveNode): void {
    clearNodeScheduled(node);
  }

  reset(): void {
    this.queue.length = 0;
    this.head = 0;
    this.flushing = false;
  }
}
