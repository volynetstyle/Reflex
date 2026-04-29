import type { EventBoundary, EventSource } from "../infra/event";
import { identityBoundary, emitEvent } from "../infra/event";
import { attachQueueState } from "./scheduler";
import { createRingQueue } from "./scheduler/scheduler.queue";
import type { QueueBacked } from "./scheduler";

type EventDispatchRecord = {
  source: EventSource<unknown>;
  value: unknown;
};

export interface EventDispatcher extends QueueBacked<EventDispatchRecord> {
  flushing: boolean;
  readonly runBoundary: EventBoundary;
  readonly flush: () => void;
  emit<T>(source: EventSource<T>, value: T): void;
}

export function createEventDispatcher(
  runBoundary: EventBoundary = identityBoundary,
): EventDispatcher {
  const queue = createRingQueue<EventDispatchRecord>();

  const dispatcher = attachQueueState(
    {
      queue,
      flushing: false,
      runBoundary,
      flush: () => flushEventDispatcher(dispatcher),
      emit<T>(source: EventSource<T>, value: T): void {
        queue.push({
          source: source as EventSource<unknown>,
          value,
        });
        if (!dispatcher.flushing) {
          runBoundary(dispatcher.flush);
        }
      },
    },
    queue,
  ) satisfies EventDispatcher;

  return dispatcher;
}

export const EventDispatcher = createEventDispatcher;

function flushEventDispatcher(dispatcher: EventDispatcher): void {
  if (dispatcher.flushing) return;
  dispatcher.flushing = true;

  try {
    while (dispatcher.queue.size !== 0) {
      const record = dispatcher.queue.shift()!;
      emitEvent(record.source, record.value);
    }
  } finally {
    dispatcher.queue.clear();
    dispatcher.flushing = false;
  }
}
