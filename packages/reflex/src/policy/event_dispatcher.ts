import type { EventBoundary, EventSource } from "../infra/event";
import { identityBoundary, emitEvent } from "../infra/event";

export class EventDispatcher {
  readonly queue: unknown[] = [];
  head: number = 0;
  flushing: boolean = false;
  readonly runBoundary: EventBoundary;
  readonly flush: () => void;

  constructor(runBoundary: EventBoundary = identityBoundary) {
    this.runBoundary = runBoundary;
    this.flush = (): void => this._flush();
    this.flush = this._flush.bind(this);
  }

  emit<T>(source: EventSource<T>, value: T): void {
    this.queue.push(source, value);
    if (!this.flushing) this.runBoundary(this.flush);
  }

  private _flush(): void {
    if (this.flushing) return;
    this.flushing = true;

    try {
      const q = this.queue;
      while (this.head < q.length) {
        const source = q[this.head++] as EventSource<unknown>;
        const value = q[this.head++];
        emitEvent(source, value);
      }
    } finally {
      this.queue.length = 0;
      this.head = 0;
      this.flushing = false;
    }
  }
}
