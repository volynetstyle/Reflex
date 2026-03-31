export const enum EventSubscriberState {
  Active = 1 << 0,
  Disposed = 1 << 1,
}

export class EventSource<T> {
  dispatchDepth = 0;
  head: EventSubscriber<T> | null = null;
  tail: EventSubscriber<T> | null = null;
  pendingHead: EventSubscriber<T> | null = null;
}

export interface EventSubscriber<T> {
  fn: (value: T) => void;
  next: EventSubscriber<T> | null;
  prev: EventSubscriber<T> | null;
  state: number;
  unlinkNext: EventSubscriber<T> | null;
}

export type EventBoundary = <T>(fn: () => T) => T;

const EVENT_SUBSCRIBER_OWNER = Symbol("EventSubscriber.owner");

type OwnedEventSubscriber<T> = EventSubscriber<T> & {
  [EVENT_SUBSCRIBER_OWNER]?: EventSource<T> | null;
};

function getSubscriberOwner<T>(
  subscriber: EventSubscriber<T>,
): EventSource<T> | null | undefined {
  return (subscriber as OwnedEventSubscriber<T>)[EVENT_SUBSCRIBER_OWNER];
}

function setSubscriberOwner<T>(
  subscriber: EventSubscriber<T>,
  source: EventSource<T> | null,
): void {
  (subscriber as OwnedEventSubscriber<T>)[EVENT_SUBSCRIBER_OWNER] = source;
}

export function identityBoundary<T>(fn: () => T): T {
  return fn();
}

export function appendSubscriber<T>(
  source: EventSource<T>,
  subscriber: EventSubscriber<T>,
): void {
  if ((subscriber.state & EventSubscriberState.Active) === 0) return;

  const owner = getSubscriberOwner(subscriber);
  if (owner !== undefined && owner !== null) return;

  const tail = source.tail;
  subscriber.prev = tail;
  subscriber.next = null;
  subscriber.unlinkNext = null;
  setSubscriberOwner(subscriber, source);

  if (tail === null) {
    source.head = source.tail = subscriber;
    return;
  }

  tail.next = subscriber;
  source.tail = subscriber;
}

function unlinkSubscriber<T>(
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
  subscriber.unlinkNext = null;
  setSubscriberOwner(subscriber, null);
}

function enqueuePendingRemoval<T>(
  source: EventSource<T>,
  subscriber: EventSubscriber<T>,
): void {
  if ((subscriber.state & EventSubscriberState.Disposed) !== 0) return;

  subscriber.state |= EventSubscriberState.Disposed;
  subscriber.unlinkNext = source.pendingHead;
  source.pendingHead = subscriber;
}

function flushPendingRemovals<T>(source: EventSource<T>): void {
  let node = source.pendingHead;
  source.pendingHead = null;

  while (node !== null) {
    const next = node.unlinkNext;
    node.unlinkNext = null;

    unlinkSubscriber(source, node);
    node = next;
  }
}

export function removeSubscriber<T>(
  source: EventSource<T>,
  subscriber: EventSubscriber<T>,
): void {
  if (getSubscriberOwner(subscriber) !== source) return;
  if ((subscriber.state & EventSubscriberState.Active) === 0) return;

  subscriber.state &= ~EventSubscriberState.Active;

  if (source.dispatchDepth !== 0) {
    enqueuePendingRemoval(source, subscriber);
    return;
  }

  subscriber.state |= EventSubscriberState.Disposed;
  unlinkSubscriber(source, subscriber);
}

export function subscribeEvent<T>(
  source: EventSource<T>,
  fn: (value: T) => void,
): () => void {
  const subscriber: EventSubscriber<T> = {
    fn,
    next: null,
    prev: null,
    state: EventSubscriberState.Active,
    unlinkNext: null,
  };

  appendSubscriber(source, subscriber);

  return () => {
    removeSubscriber(source, subscriber);
  };
}

export function emitEvent<T>(
  source: EventSource<T>,
  value: T,
  boundary: EventBoundary = identityBoundary,
): void {
  boundary(() => {
    const end = source.tail;
    if (end === null) return;

    ++source.dispatchDepth;

    try {
      let node = source.head;

      while (node !== null) {
        const current = node;
        const next = current === end ? null : current.next;

        if ((current.state & EventSubscriberState.Active) !== 0) {
          current.fn(value);
        }

        node = next;
      }
    } finally {
      --source.dispatchDepth;

      if (source.dispatchDepth === 0 && source.pendingHead !== null) {
        flushPendingRemovals(source);
      }
    }
  });
}
