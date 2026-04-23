import type { RingQueue, WatcherQueue, EffectNode } from "./scheduler.types";

const INITIAL_QUEUE_CAPACITY = 16;

function growRingQueue<T>(queue: RingQueue<T>): void {
  const ring = queue.ring;
  const capacity = ring.length;
  if (capacity === 0) {
    ring.length = INITIAL_QUEUE_CAPACITY;
    return;
  }

  const size = queue.size;
  const head = queue.head;
  const mask = capacity - 1;
  const nextCapacity = capacity << 1;
  const next = new Array<T>(nextCapacity);

  for (let i = 0; i < size; ++i) {
    next[i] = ring[(head + i) & mask]!;
  }

  ring.length = nextCapacity;
  for (let i = 0; i < size; ++i) {
    ring[i] = next[i]!;
  }

  queue.head = 0;
  queue.tail = size;
}

export function pushRingQueue<T>(queue: RingQueue<T>, node: T): void {
  const ring = queue.ring;
  if (queue.size === ring.length) {
    growRingQueue(queue);
  }

  const tail = queue.tail;
  ring[tail] = node;
  queue.tail = (tail + 1) & (ring.length - 1);
  ++queue.size;
}

export function shiftRingQueue<T>(queue: RingQueue<T>): T | null {
  if (queue.size === 0) {
    return null;
  }

  const ring = queue.ring;
  const head = queue.head;
  const node = ring[head]!;
  ring[head] = undefined as T;
  queue.head = (head + 1) & (ring.length - 1);
  --queue.size;
  return node;
}

export function clearRingQueue<T>(queue: RingQueue<T>): void {
  queue.head = 0;
  queue.tail = 0;
  queue.size = 0;
}

function pushRingQueueMethod<T>(this: RingQueue<T>, node: T): void {
  pushRingQueue(this, node);
}

function shiftRingQueueMethod<T>(this: RingQueue<T>): T | null {
  return shiftRingQueue(this);
}

function clearRingQueueMethod<T>(this: RingQueue<T>): void {
  clearRingQueue(this);
}

export function createRingQueue<T>(): RingQueue<T> {
  return {
    ring: [] as T[],
    head: 0,
    tail: 0,
    size: 0,
    push: pushRingQueueMethod,
    shift: shiftRingQueueMethod,
    clear: clearRingQueueMethod,
  };
}

export function pushWatcherQueue(queue: WatcherQueue, node: EffectNode): void {
  pushRingQueue(queue, node);
}

export function shiftWatcherQueue(queue: WatcherQueue): EffectNode | null {
  return shiftRingQueue(queue);
}

export function clearWatcherQueue(queue: WatcherQueue): void {
  clearRingQueue(queue);
}

export function createWatcherQueue(): WatcherQueue {
  return createRingQueue<EffectNode>();
}
