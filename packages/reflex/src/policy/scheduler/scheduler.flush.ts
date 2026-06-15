import { runWatcher } from "@volynets/reflex-runtime";
import {
  schedulerPolicyCounters,
  schedulerPolicyCountersEnabled,
} from "./scheduler.counters";
import { UNSCHEDULE_MASK } from "./scheduler.constants";
import type { WatcherQueue } from "./scheduler.types";

export function cleanupQueuedNodesAfterAbort(queue: WatcherQueue): void {
  const ring = queue.ring;
  const mask = queue.mask;
  let head = queue.head;

  while (head !== queue.tail) {
    const index = head & mask;
    const node = ring[index]!;

    ring[index] = undefined;
    node.state &= UNSCHEDULE_MASK;
    ++head;
  }

  queue.head = 0;
  queue.tail = 0;
}

export function flushQueuedWatchers(
  queue: WatcherQueue,
  thrown: unknown,
  noThrow: unknown,
): unknown {
  let head = queue.head;
  let tail = queue.tail;
  const ring = queue.ring;
  const mask = queue.mask;

  while (head !== tail) {
    const index = head & mask;
    const node = ring[index]!;

    ring[index] = undefined;
    head += 1;
    queue.head = head;

    // Clear before running so a watcher may enqueue itself again.
    node.state &= UNSCHEDULE_MASK;

    if (typeof node.compute !== "function") {
      tail = queue.tail;
      continue;
    }

    if (__PROFILE__ && schedulerPolicyCountersEnabled) {
      schedulerPolicyCounters.effectsRun += 1;
    }

    try {
      runWatcher(node);
    } catch (error) {
      if (thrown === noThrow) {
        thrown = error;
      }
    }

    tail = queue.tail;
  }

  queue.tail = head;

  return thrown;
}
