import {
  EventSource,
  EventBoundary,
  emitEvent,
  identityBoundary,
} from "@reflex/runtime";

export class EventDispatcher {
  private readonly sources: EventSource<unknown>[] = [];
  private readonly values: unknown[] = [];
  private head = 0;
  private flushing = false;

  constructor(private readonly runBoundary: EventBoundary = identityBoundary) {}

  emit<T>(source: EventSource<T>, value: T): void {
    this.sources.push(source as EventSource<unknown>);
    this.values.push(value);

    if (!this.flushing) {
      this.runBoundary(this.flush);
    }
  }

  private readonly flush = (): void => {
    /* c8 ignore start -- guarded against hostile/custom boundaries re-entering flush */
    if (this.flushing) return;
    /* c8 ignore stop */

    this.flushing = true;

    try {
      const sources = this.sources;
      const values = this.values;

      while (this.head < sources.length) {
        const index = this.head++;
        emitEvent(sources[index]!, values[index]);
      }
    } finally {
      this.sources.length = 0;
      this.values.length = 0;
      this.head = 0;
      this.flushing = false;
    }
  };
}
