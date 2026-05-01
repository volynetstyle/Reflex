import { runWatcher } from "@volynets/reflex-runtime";
import { UNSCHEDULE_MASK } from "./scheduler.constants";
import type { EffectNode, WatcherQueue } from "./scheduler.types";

export function cleanupQueuedNodesAfterAbort(queue: WatcherQueue): void {
  while (queue.size !== 0) {
    queue.shift()!.state &= UNSCHEDULE_MASK;
  }

  queue.clear();
}

function getEffectPriority(node: EffectNode): number {
  return (node as EffectNode & { priority?: number }).priority ?? 0;
}

function flushWatcherQueueFIFO(
  queue: WatcherQueue,
  thrown: unknown,
): unknown {
  while (queue.size !== 0) {
    const node = queue.shift()!;
    node.state &= UNSCHEDULE_MASK;

    try {
      runWatcher(node);
    } catch (error) {
      if (thrown === null) {
        thrown = error;
      }
    }
  }

  return thrown;
}

function flushWatcherQueuePriority(
  queue: WatcherQueue,
  thrown: unknown,
): unknown {
  const pending: EffectNode[] = [];

  while (queue.size !== 0) {
    pending.push(queue.shift()!);
  }

  pending.sort(
    (left, right) => getEffectPriority(right) - getEffectPriority(left),
  );

  for (let index = 0; index < pending.length; index++) {
    const node = pending[index]!;
    node.state &= UNSCHEDULE_MASK;

    try {
      runWatcher(node);
    } catch (error) {
      if (thrown === null) {
        thrown = error;
      }
    }
  }

  return thrown;
}

export function flushQueuedWatchers(
  queue: WatcherQueue,
  thrown: unknown,
  priority: boolean,
): unknown {
  return priority
    ? flushWatcherQueuePriority(queue, thrown)
    : flushWatcherQueueFIFO(queue, thrown);
}
