import {
  Both,
  flushPendingRuntimeIdle,
  releaseWatcherSchedule,
  RuntimeState,
  runtimeState,
  runWatcherWithoutSettledCheckpoint,
  Scheduled,
} from "@volynets/reflex-runtime/internal";
import { profileSchedulerPolicyCounter } from "./scheduler.counters";
import { tryEnqueue } from "./scheduler.enqueue";
import type { WatcherQueue } from "./scheduler.types";

const SCHEDULER_PROFILE_ENABLED =
  typeof __PROFILE__ !== "undefined" && __PROFILE__;

/**
 * Remove a watcher that reclaimed this queue while it was being validated.
 *
 * This is an exception-only ownership repair. Keeping it out of the normal
 * dequeue loop avoids taxing successful watcher execution.
 */
function detachQueuedValidationRetry(
  queue: WatcherQueue,
  node: WatcherQueue["ring"][number],
): boolean {
  if (node === undefined) return false;

  const ring = queue.ring;
  const mask = queue.mask;
  const head = queue.head;
  const tail = queue.tail;

  for (let cursor = head; cursor !== tail; ++cursor) {
    if (ring[cursor & mask] !== node) continue;

    for (let index = cursor; index + 1 !== tail; ++index) {
      ring[index & mask] = ring[(index + 1) & mask];
    }

    ring[(tail - 1) & mask] = undefined;
    queue.tail = tail - 1;
    releaseWatcherSchedule(node);
    return true;
  }

  return false;
}

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
  let validationRetries: WatcherQueue["ring"] | undefined;

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

      // A failed dependency validation remains dirty and must be retryable by
      // the next explicit drain, not recursively in this one. Callback and
      // cleanup failures recover to clean and do not enter this cold branch.
      if ((node.state & Both) !== 0) {
        if ((node.state & Scheduled) !== 0) {
          detachQueuedValidationRetry(queue, node);
        }
        (validationRetries ??= []).push(node);
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

  if (validationRetries !== undefined) {
    for (const node of validationRetries) {
      if (node !== undefined) tryEnqueue(queue, node);
    }
  }

  if ((runtimeState & RuntimeState.IdlePending) !== RuntimeState.Idle) {
    try {
      flushPendingRuntimeIdle();
    } catch (error) {
      if (thrown === noThrow) thrown = error;
    }
  }

  return thrown;
}
