import type { RingQueue } from "./scheduler.types";

const INITIAL_QUEUE_CAPACITY = 16;

export function createRingQueue<T>(): RingQueue<T> {
  const queue: RingQueue<T> = {
    ring: new Array<T>(INITIAL_QUEUE_CAPACITY),
    head: 0,
    tail: 0,
    size: 0,
    push(node: T): void {
      pushRingQueue(queue, node);
    },
    shift(): T | null {
      return shiftRingQueue(queue);
    },
    clear(): void {
      clearRingQueue(queue);
    },
  };

  return queue;
}

function growRingQueue<T>(queue: RingQueue<T>): void {
  const ring = queue.ring;
  const capacity = ring.length;

  if (capacity === 0) {
    queue.ring = new Array<T>(INITIAL_QUEUE_CAPACITY);
    queue.head = 0;
    queue.tail = 0;
    return;
  }

  const size = queue.size;
  const head = queue.head;
  const mask = capacity - 1;
  const next = new Array<T>(capacity << 1);

  for (let i = 0; i < size; ++i) {
    next[i] = ring[(head + i) & mask]!;
  }

  queue.ring = next;
  queue.head = 0;
  queue.tail = size;
}

export function pushRingQueue<T>(queue: RingQueue<T>, node: T): void {
  let ring = queue.ring;

  if (queue.size === ring.length) {
    growRingQueue(queue);
    ring = queue.ring;
  }

  const tail = queue.tail;

  ring[tail] = node;
  queue.tail = (tail + 1) & (ring.length - 1);
  ++queue.size;
}

export function shiftRingQueue<T>(queue: RingQueue<T>): T | null {
  const size = queue.size;

  if (size === 0) {
    return null;
  }

  const ring = queue.ring;
  const head = queue.head;
  const node = ring[head]!;

  ring[head] = undefined as T;
  queue.head = (head + 1) & (ring.length - 1);
  queue.size = size - 1;

  return node;
}

export function resetRingQueue<T>(queue: RingQueue<T>): void {
  queue.head = 0;
  queue.tail = 0;
  queue.size = 0;
}

export function clearRingQueue<T>(queue: RingQueue<T>): void {
  const ring = queue.ring;
  const size = queue.size;

  if (size === 0) {
    queue.head = 0;
    queue.tail = 0;
    return;
  }

  const head = queue.head;
  const mask = ring.length - 1;

  for (let i = 0; i < size; ++i) {
    ring[(head + i) & mask] = undefined as T;
  }

  queue.head = 0;
  queue.tail = 0;
  queue.size = 0;
}
