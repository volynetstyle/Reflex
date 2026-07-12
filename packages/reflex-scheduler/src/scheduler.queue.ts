import type { RingQueue } from "./scheduler.types";

const INITIAL_QUEUE_CAPACITY = 16;

export function createRingQueue<T>(): RingQueue<T> {
  const capacity = INITIAL_QUEUE_CAPACITY;

  return {
    // Keep the ring packed instead of creating a holey array.
    ring: new Array<T | undefined>(capacity).fill(undefined),
    mask: capacity - 1,
    head: 0,
    tail: 0,
  };
}

export function pushRingQueue<T>(queue: RingQueue<T>, node: T): void {
  let ring = queue.ring;
  const head = queue.head;
  let tail = queue.tail;

  if (tail - head === ring.length) {
    growRingQueue(queue);
    ring = queue.ring;
    tail = queue.tail;
  }

  ring[tail & queue.mask] = node;
  queue.tail = tail + 1;
}

export function shiftRingQueue<T>(queue: RingQueue<T>): T | null {
  const head = queue.head;

  if (head === queue.tail) {
    return null;
  }

  const index = head & queue.mask;
  const ring = queue.ring;
  const node = ring[index]!;

  ring[index] = undefined;
  queue.head = head + 1;

  return node;
}

function growRingQueue<T>(queue: RingQueue<T>): void {
  const ring = queue.ring;
  const oldCapacity = ring.length;
  const oldMask = queue.mask;
  const head = queue.head;
  const tail = queue.tail;
  const size = tail - head;
  const nextCapacity = oldCapacity << 1;
  const next = new Array<T | undefined>(nextCapacity).fill(undefined);

  for (let index = 0; index < size; ++index) {
    next[index] = ring[(head + index) & oldMask];
  }

  queue.ring = next;
  queue.mask = nextCapacity - 1;
  queue.head = 0;
  queue.tail = size;
}

export function resetRingQueue<T>(queue: RingQueue<T>): void {
  queue.head = 0;
  queue.tail = 0;
}

export function clearRingQueue<T>(queue: RingQueue<T>): void {
  const ring = queue.ring;
  const mask = queue.mask;
  const head = queue.head;
  const tail = queue.tail;

  if (head === tail) {
    queue.head = 0;
    queue.tail = 0;
    return;
  }

  for (let i = head; i < tail; ++i) {
    ring[i & mask] = undefined;
  }

  queue.head = 0;
  queue.tail = 0;
}
