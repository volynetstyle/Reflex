import type { ReactiveNode } from "@volynets/reflex-runtime";
import { Scheduled } from "@volynets/reflex-runtime";
import {
  SCHEDULED_OR_DISPOSED,
  UNSCHEDULE_MASK,
} from "./scheduler.constants";
import type { EffectNode, WatcherQueue } from "./scheduler.types";
import { pushRingQueue } from "./scheduler.queue";

/**
 * Marks an effect watcher node as scheduled.
 *
 * This is a low-level helper used by scheduler integrations and tests to set
 * the runtime's scheduled flag on a watcher node.
 */
export function effectScheduled(node: EffectNode) {
  node.state |= Scheduled;
}

/**
 * Clears the scheduled flag from an effect watcher node.
 *
 * This is a low-level helper used by scheduler integrations and tests to mark
 * a watcher as no longer queued for execution.
 */
export function effectUnscheduled(node: EffectNode) {
  node.state &= UNSCHEDULE_MASK;
}

export function tryEnqueue(queue: WatcherQueue, node: ReactiveNode): boolean {
  const effectNode = node as EffectNode;
  const state = effectNode.state;
  if ((state & SCHEDULED_OR_DISPOSED) !== 0) {
    return false;
  }

  effectNode.state = state | Scheduled;
  pushRingQueue(queue, effectNode);
  return true;
}
