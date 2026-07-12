import {
  Scheduled,
  type ReactiveNode,
} from "@volynets/reflex-runtime/internal";
import { profileSchedulerPolicyCounter } from "./scheduler.counters";
import type { EffectNode, WatcherQueue } from "./scheduler.types";

const SCHEDULER_PROFILE_ENABLED =
  typeof __PROFILE__ !== "undefined" && __PROFILE__;

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
  const tail = queue.tail;

  if (tail - head === ring.length) {
    growWatcherQueue(queue, ring, head, tail);
    ring = queue.ring;
  }

  ring[tail & queue.mask] = node as EffectNode;
  queue.tail = tail + 1;
  if (SCHEDULER_PROFILE_ENABLED)
    profileSchedulerPolicyCounter("effectsScheduled");
  return true;
}

function growWatcherQueue(
  queue: WatcherQueue,
  ring: Array<EffectNode | undefined>,
  head: number,
  tail: number,
): void {
  const oldMask = queue.mask;
  const nextCapacity = ring.length << 1;
  const nextMask = nextCapacity - 1;
  const next = new Array<EffectNode | undefined>(nextCapacity).fill(undefined);

  for (let index = head; index < tail; ++index) {
    next[index & nextMask] = ring[index & oldMask];
  }

  queue.ring = next;
  queue.mask = nextMask;
}
