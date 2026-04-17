import type { WatcherQueue, EffectNode } from "./scheduler.types";

const INITIAL_QUEUE_CAPACITY = 16;

function growWatcherQueue(queue: WatcherQueue): void {
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
  const next = new Array<EffectNode>(nextCapacity);

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

export function pushWatcherQueue(queue: WatcherQueue, node: EffectNode): void {
  const ring = queue.ring;
  if (queue.size === ring.length) {
    growWatcherQueue(queue);
  }

  const tail = queue.tail;
  ring[tail] = node;
  queue.tail = (tail + 1) & (ring.length - 1);
  ++queue.size;
}

export function shiftWatcherQueue(queue: WatcherQueue): EffectNode | null {
  if (queue.size === 0) {
    return null;
  }

  const ring = queue.ring;
  const head = queue.head;
  const node = ring[head]!;
  ring[head] = undefined as never;
  queue.head = (head + 1) & (ring.length - 1);
  --queue.size;
  return node;
}

export function clearWatcherQueue(queue: WatcherQueue): void {
  queue.head = 0;
  queue.tail = 0;
  queue.size = 0;
}

function pushWatcherQueueMethod(this: WatcherQueue, node: EffectNode): void {
  pushWatcherQueue(this, node);
}

function shiftWatcherQueueMethod(this: WatcherQueue): EffectNode | null {
  return shiftWatcherQueue(this);
}

function clearWatcherQueueMethod(this: WatcherQueue): void {
  clearWatcherQueue(this);
}

export function createWatcherQueue(): WatcherQueue {
  return {
    ring: [],
    head: 0,
    tail: 0,
    size: 0,
    push: pushWatcherQueueMethod,
    shift: shiftWatcherQueueMethod,
    clear: clearWatcherQueueMethod,
  };
}
