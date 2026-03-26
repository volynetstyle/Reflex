import {
  emitEvent,
  identityBoundary,
} from "@reflex/runtime";
import type { EventBoundary, EventSource } from "@reflex/runtime";

export class EventDispatcher {
  private readonly queue: unknown[] = [];
  private head = 0;
  private flushing = false;

  constructor(
    private readonly runBoundary: EventBoundary = identityBoundary,
  ) {}

  emit<T>(source: EventSource<T>, value: T): void {
    this.queue.push(source, value);

    if (!this.flushing) {
      this.runBoundary(this.flush);
    }
  }

  private readonly flush = (): void => {
    if (this.flushing) return;

    this.flushing = true;

    try {
      const queue = this.queue;

      while (this.head < queue.length) {
        const source = queue[this.head++] as EventSource<unknown>;
        const value = queue[this.head++];
        emitEvent(source, value);
      }
    } finally {
      this.queue.length = 0;
      this.head = 0;
      this.flushing = false;
    }
  };
}
