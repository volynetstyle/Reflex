import {
  flushPendingReactiveSettledIfIdle,
  pendingReactiveSettled,
  releaseWatcherSchedule,
  runWatcherWithoutSettledCheckpoint,
} from "@volynets/reflex-runtime/internal";
import { profileSchedulerPolicyCounter } from "./scheduler.counters";
import type { WatcherQueue } from "./scheduler.types";

const SCHEDULER_PROFILE_ENABLED =
  typeof __PROFILE__ !== "undefined" && __PROFILE__;

export function cleanupQueuedNodesAfterAbort(
  queue: WatcherQueue,
  preserveCursor = false,
): void {
  const ring = queue.ring;
  const mask = queue.mask;
  const cursor = queue.head;
  let head = cursor;
  const tail = queue.tail;

  while (head !== tail) {
    const index = head & mask;
    const node = ring[index]!;

    ring[index] = undefined;
    releaseWatcherSchedule(node);
    ++head;
  }

  queue.head = preserveCursor ? cursor : 0;
  queue.tail = preserveCursor ? cursor : 0;
}

export function flushQueuedWatchers(
  queue: WatcherQueue,
  thrown: unknown,
  noThrow: unknown,
): unknown {
  let head = queue.head;
  let tail = queue.tail;
  let ring = queue.ring;
  let mask = queue.mask;

  while (head !== tail) {
    const index = head & mask;
    const node = ring[index]!;

    ring[index] = undefined;
    head += 1;
    queue.head = head;

    // Clear before running so a watcher may enqueue itself again.
    releaseWatcherSchedule(node);

    if (node.compute === undefined) continue;

    if (SCHEDULER_PROFILE_ENABLED) profileSchedulerPolicyCounter("effectsRun");

    try {
      runWatcherWithoutSettledCheckpoint(node);
    } catch (error) {
      if (thrown === noThrow) {
        thrown = error;
      }
    }

    tail = queue.tail;

    // Enqueue may grow the ring while a watcher is running. Growth preserves
    // logical cursors, so only the backing storage and mask need reloading.
    if (ring !== queue.ring) {
      ring = queue.ring;
      mask = queue.mask;
    }
  }

  // Keep cursors in the Smi range for long-lived schedulers. A successful
  // drain has cleared every live slot, so normalizing is safe and also keeps
  // subsequent enqueue indices near zero.
  queue.head = 0;
  queue.tail = 0;

  if (pendingReactiveSettled) {
    try {
      flushPendingReactiveSettledIfIdle();
    } catch (error) {
      if (thrown === noThrow) thrown = error;
    }
  }

  return thrown;
}
