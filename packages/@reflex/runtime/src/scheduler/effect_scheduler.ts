import { runEffect } from "../reactivity/engine/effect";
import { DIRTY_STATE, ReactiveNode, ReactiveNodeState } from "../reactivity/shape";

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
    if (
      (node.state & ReactiveNodeState.Disposed) !== 0 ||
      (node.state & ReactiveNodeState.Scheduled) !== 0
    )
      return;

    node.state |= ReactiveNodeState.Scheduled;
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
        node.state &= ~ReactiveNodeState.Scheduled;

        if (
          (node.state & ReactiveNodeState.Disposed) !== 0 ||
          (node.state & DIRTY_STATE) === 0
        ) {
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
    node.state &= ~ReactiveNodeState.Scheduled;
  }

  reset(): void {
    this.queue.length = 0;
    this.head = 0;
    this.flushing = false;
  }
}
