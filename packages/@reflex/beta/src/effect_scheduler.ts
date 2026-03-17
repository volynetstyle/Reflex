import {
  EngineContext,
  ReactiveNode,
  clearNodeScheduled,
  isDirtyState,
  isDisposedState,
  isScheduledState,
  markNodeScheduled,
} from "./core.js";
import { runEffect } from "./engine/effect.js";

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
  private head: number = 0;
  private flushing: boolean = false;

  constructor(
    private readonly ctx: EngineContext,
    private readonly mode: EffectSchedulerMode,
  ) {}

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

        runEffect(this.ctx, node);
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
}
