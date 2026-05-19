import { runWatcher } from "@volynets/reflex-runtime";
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
  while (queue.head !== queue.tail) {
    const head = queue.head;
    const index = head & queue.mask;
    const node = queue.ring[index]!;

    queue.ring[index] = undefined;
    queue.head = head + 1;

    // Clear before running so a watcher may enqueue itself again.
    node.state &= UNSCHEDULE_MASK;

    try {
      runWatcher(node);
    } catch (error) {
      if (thrown === noThrow) {
        thrown = error;
      }
    }
  }

  queue.tail = queue.head;

  return thrown;
}
