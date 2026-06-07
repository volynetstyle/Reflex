import { Scheduled, type ReactiveNode } from "@volynets/reflex-runtime/internal";
import type { EffectNode, WatcherQueue } from "./scheduler.types";

/**
 * Marks an effect watcher node as scheduled.
 *
 * This is a low-level helper used by scheduler integrations and tests to set
 * the runtime's scheduled flag on a watcher node.
 */
// 
export function effectScheduled(node: EffectNode) {
  node.state = node.state | Scheduled;
}

/**
 * Clears the scheduled flag from an effect watcher node.
 *
 * This is a low-level helper used by scheduler integrations and tests to mark
 * a watcher as no longer queued for execution.
 */
// 
export function effectUnscheduled(node: EffectNode) {
  node.state = node.state & ~Scheduled;
}

// 
// STRAIGHT 
export function tryEnqueue(queue: WatcherQueue, node: ReactiveNode): boolean {
  const state = node.state;
  if ((state & Scheduled) !== 0) {
    return false;
  }

  node.state = state | Scheduled;
  let ring = queue.ring;
  const head = queue.head;
  let tail = queue.tail;

  if (tail - head === ring.length) {
    const oldCapacity = ring.length;
    const oldMask = queue.mask;
    const size = tail - head;
    const nextCapacity = oldCapacity << 1;
    const next = new Array<EffectNode | undefined>(nextCapacity).fill(
      undefined,
    );

    for (let i = 0; i < size; ++i) {
      next[i] = ring[(head + i) & oldMask];
    }

    queue.ring = next;
    queue.mask = nextCapacity - 1;
    queue.head = 0;
    queue.tail = size;
    ring = next;
    tail = size;
  }

  ring[tail & queue.mask] = node as EffectNode;
  queue.tail = tail + 1;
  return true;
}
