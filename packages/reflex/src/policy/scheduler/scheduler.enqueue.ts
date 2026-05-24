import { Scheduled, type ReactiveNode } from "@volynets/reflex-runtime/internal";
import type { EffectNode, WatcherQueue } from "./scheduler.types";
import { pushRingQueue } from "./scheduler.queue";

/**
 * Marks an effect watcher node as scheduled.
 *
 * This is a low-level helper used by scheduler integrations and tests to set
 * the runtime's scheduled flag on a watcher node.
 */
// @__INLINE__
export function effectScheduled(node: EffectNode) {
  node.state = node.state | Scheduled;
}

/**
 * Clears the scheduled flag from an effect watcher node.
 *
 * This is a low-level helper used by scheduler integrations and tests to mark
 * a watcher as no longer queued for execution.
 */
// @__INLINE__
export function effectUnscheduled(node: EffectNode) {
  node.state = node.state & ~Scheduled;
}

// @__INLINE__
// STRAIGHT 
export function tryEnqueue(queue: WatcherQueue, node: ReactiveNode): boolean {
  const state = node.state;
  if ((state & Scheduled) !== 0) {
    return false;
  }

  node.state = state | Scheduled;
  pushRingQueue(queue, node);
  return true;
}
