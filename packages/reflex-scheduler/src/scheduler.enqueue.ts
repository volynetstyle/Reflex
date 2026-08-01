import {
  claimWatcherSchedule,
  releaseWatcherSchedule,
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
  claimWatcherSchedule(node);
}

/**
 * Clears the scheduled flag from an effect watcher node.
 *
 * This is a low-level helper used by scheduler integrations and tests to mark
 * a watcher as no longer queued for execution.
 */
//
export function effectUnscheduled(node: EffectNode) {
  releaseWatcherSchedule(node);
}

//
// STRAIGHT
export function tryEnqueue(queue: WatcherQueue, node: ReactiveNode): boolean {
  const watcher = node as EffectNode;

  if (!claimWatcherSchedule(watcher)) return false;

  try {
    acceptClaimedWatcher(queue, watcher);
  } catch (error) {
    releaseWatcherSchedule(watcher);
    throw error;
  }

  return true;
}

/**
 * Materializes an already-owned schedule claim in the queue.
 *
 * Preconditions:
 * - claimWatcherSchedule(node) has succeeded;
 * - the claim has not already been accepted by another queue.
 */
export function acceptClaimedWatcher(
  queue: WatcherQueue,
  node: EffectNode,
): void {
  let ring = queue.ring;
  const head = queue.head;
  const tail = queue.tail;

  if (tail - head === ring.length) {
    growWatcherQueue(queue, ring, head, tail);
    ring = queue.ring;
  }

  ring[tail & queue.mask] = node;
  queue.tail = tail + 1;
  if (SCHEDULER_PROFILE_ENABLED)
    profileSchedulerPolicyCounter("effectsScheduled");
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
