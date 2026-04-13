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

function pushWatcherQueue(this: WatcherQueue, node: EffectNode): void {
  const ring = this.ring;
  if (this.size === ring.length) {
    growWatcherQueue(this);
  }

  const tail = this.tail;
  ring[tail] = node;
  this.tail = (tail + 1) & (ring.length - 1);
  ++this.size;
}

function shiftWatcherQueue(this: WatcherQueue): EffectNode | null {
  if (this.size === 0) {
    return null;
  }

  const ring = this.ring;
  const head = this.head;
  const node = ring[head]!;
  ring[head] = undefined as never;
  this.head = (head + 1) & (ring.length - 1);
  --this.size;
  return node;
}

function clearWatcherQueue(this: WatcherQueue): void {
  this.head = 0;
  this.tail = 0;
  this.size = 0;
}

export function createWatcherQueue(): WatcherQueue {
  return {
    ring: [],
    head: 0,
    tail: 0,
    size: 0,
    push: pushWatcherQueue,
    shift: shiftWatcherQueue,
    clear: clearWatcherQueue,
  };
}
