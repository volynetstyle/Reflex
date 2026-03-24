export interface EventSubscriber<T> {
  fn: (value: T) => void;
  next: EventSubscriber<T> | null;
  prev: EventSubscriber<T> | null;
  active: boolean;
}

export class EventSource<T> {
  head: EventSubscriber<T> | null = null;
  tail: EventSubscriber<T> | null = null;
}

export type EventBoundary = <T>(fn: () => T) => T;

export function identityBoundary<T>(fn: () => T): T {
  return fn();
}

export function appendSubscriber<T>(
  source: EventSource<T>,
  subscriber: EventSubscriber<T>,
): void {
  const tail = source.tail;

  if (tail === null) {
    source.head = source.tail = subscriber;
    return;
  }

  subscriber.prev = tail;
  tail.next = source.tail = subscriber;
}

export function removeSubscriber<T>(
  source: EventSource<T>,
  subscriber: EventSubscriber<T>,
): void {
  const prev = subscriber.prev;
  const next = subscriber.next;

  if (prev === null) source.head = next;
  else prev.next = next;

  if (next === null) source.tail = prev;
  else next.prev = prev;

  subscriber.prev = null;
  subscriber.next = null;
  subscriber.active = false;
}

export function subscribeEvent<T>(
  source: EventSource<T>,
  fn: (value: T) => void,
): () => void {
  const subscriber: EventSubscriber<T> = {
    fn,
    next: null,
    prev: null,
    active: true,
  };

  appendSubscriber(source, subscriber);

  return () => {
    if (subscriber.active) {
      removeSubscriber(source, subscriber);
    }
  };
}

export function emitEvent<T>(
  source: EventSource<T>,
  value: T,
  boundary: EventBoundary = identityBoundary,
): void {
  boundary(() => {
    const last = source.tail;
    if (last === null) return;

    const snapshot: EventSubscriber<T>[] = [];

    for (let node = source.head; node !== null; node = node.next) {
      snapshot.push(node);
      if (node === last) break;
    }

    for (let i = 0; i < snapshot.length; i++) {
      const node = snapshot[i]!;
      if (node.active) {
        node.fn(value);
      }
    }
  });
}
