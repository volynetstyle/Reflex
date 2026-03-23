import {
  ReactiveEventSourceNode,
  ReactiveEvent,
  ReactiveEventBoundary,
} from "@reflex/runtime";

function runWithoutBoundary<T>(fn: () => T): T {
  return fn();
}

function detachSubscriber<T>(
  source: ReactiveEventSourceNode<T>,
  subscriber: ReactiveEvent<T>,
): void {
  const prev = subscriber.prev;
  const next = subscriber.next;

  if (prev !== null) prev.next = next;
  else source.head = next;

  if (next !== null) next.prev = prev;
  else source.tail = prev;

  subscriber.active = false;
}

export function createSource<T>(): ReactiveEventSourceNode<T> {
  return {
    head: null,
    tail: null,
  };
}

export function subscribe<T>(
  source: ReactiveEventSourceNode<T>,
  fn: (value: T) => void,
): () => void {
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

function deliver(
  source: ReactiveEventSourceNode<unknown>,
  value: unknown,
): void {
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

export class EventDispatcher {
  private readonly sources: ReactiveEventSourceNode<unknown>[] = [];
  private readonly values: unknown[] = [];
  private head = 0;
  private flushing = false;

  constructor(
    private readonly runBoundary: ReactiveEventBoundary = runWithoutBoundary,
  ) {}

  emit<T>(source: ReactiveEventSourceNode<T>, value: T): void {
    this.sources.push(source as ReactiveEventSourceNode<unknown>);
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
        deliver(sources[index]!, values[index]);
      }
    } finally {
      this.sources.length = 0;
      this.values.length = 0;
      this.head = 0;
      this.flushing = false;
    }
  };
}
