import { unlinkAllSubscribers } from "./methods";
import { ReactiveNodeState } from "./ReactiveMeta";
import ReactiveNode from "./ReactiveNode";

export interface EventSubscriber<T> {
  fn: (value: T) => void;
  next: EventSubscriber<T> | null;
  prev: EventSubscriber<T> | null;
  active: boolean;
}

export class EventSource<T> {
  head: EventSubscriber<T> | null;
  tail: EventSubscriber<T> | null;

  constructor() {
    this.head = null;
    this.tail = null;
  }
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
    source.head = subscriber;
    source.tail = subscriber;
    return;
  }

  subscriber.prev = tail;
  tail.next = subscriber;
  source.tail = subscriber;
}

export function removeSubscriber<T>(
  source: EventSource<T>,
  subscriber: EventSubscriber<T>,
): void {
  const { prev, next } = subscriber;

  if (prev !== null) prev.next = next;
  else source.head = next;

  if (next !== null) next.prev = prev;
  else source.tail = prev;

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
    if (!subscriber.active) return;
    removeSubscriber(source, subscriber);
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

    const subscribers: EventSubscriber<T>[] = [];

    for (let current = source.head; current !== null; current = current.next) {
      subscribers.push(current);
      if (current === last) break;
    }

    for (const current of subscribers) {
      if (!current.active) continue;

      current.fn(value);
    }
  });
}
