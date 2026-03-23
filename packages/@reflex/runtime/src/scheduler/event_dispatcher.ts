import { EventSourceNode, ReactiveEvent, Boundary } from "../reactivity/shape/ReactiveEvent";

function runWithoutBoundary<T>(fn: () => T): T {
  return fn();
}

function detachSubscriber<T>(
  source: EventSourceNode<T>,
  subscriber: ReactiveEvent<T>,
): void {
  const prev = subscriber.prev;
  const next = subscriber.next;

  if (prev !== null) prev.next = next;
  else source.head = next;

  if (next !== null) next.prev = prev;
  else source.tail = prev;

  subscriber.prev = null;
  subscriber.next = null;
  subscriber.active = false;
}

export class EventDispatcher {
  private readonly sources: EventSourceNode<unknown>[] = [];
  private readonly values: unknown[] = [];
  private head = 0;
  private flushing = false;

  constructor(private readonly runBoundary: Boundary = runWithoutBoundary) {}

  createSource<T>(): EventSourceNode<T> {
    return {
      head: null,
      tail: null,
    };
  }

  subscribe<T>(source: EventSourceNode<T>, fn: (value: T) => void): () => void {
    const subscriber: ReactiveEvent<T> = {
      fn,
      next: null,
      prev: source.tail,
      active: true,
    };

    const tail = source.tail;
    if (tail !== null) {
      tail.next = subscriber;
    } else {
      source.head = subscriber;
    }

    source.tail = subscriber;

    return () => {
      if (!subscriber.active) return;
      detachSubscriber(source, subscriber);
    };
  }

  emit<T>(source: EventSourceNode<T>, value: T): void {
    this.sources.push(source as EventSourceNode<unknown>);
    this.values.push(value);

    if (!this.flushing) {
      this.runBoundary(this.flush);
    }
  }

  private readonly flush = (): void => {
    if (this.flushing) return;

    this.flushing = true;

    try {
      const sources = this.sources;
      const values = this.values;

      while (this.head < sources.length) {
        const index = this.head++;
        this.deliver(sources[index]!, values[index]);
      }
    } finally {
      this.sources.length = 0;
      this.values.length = 0;
      this.head = 0;
      this.flushing = false;
    }
  };

  private deliver(source: EventSourceNode<unknown>, value: unknown): void {
    const end = source.tail;
    let current = source.head!;

    if (current === null || end === null) return;

    while (current !== end) {
      const next = current.next;
      if (current.active) current.fn(value);
      current = next!;
    }

    if (end.active) {
      end.fn(value);
    }
  }
}
