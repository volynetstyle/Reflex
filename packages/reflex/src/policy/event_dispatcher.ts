import type { EventBoundary, EventSource } from "../infra/event";
import { identityBoundary, emitEvent } from "../infra/event";
import {
  clearRingQueue,
  createRingQueue,
  pushRingQueue,
  shiftRingQueue,
} from "./scheduler/scheduler.queue";
import type { RingQueue } from "./scheduler";

type EventDispatchRecord = {
  source: EventSource<unknown>;
  value: unknown;
};

export interface EventDispatcher {
  readonly queue: RingQueue<EventDispatchRecord>;
  flushing: boolean;
  readonly runBoundary: EventBoundary;
  readonly flush: () => void;
  emit<T>(source: EventSource<T>, value: T): void;
}

interface EventDispatcherCore extends EventDispatcher {
  firstSource: EventSource<unknown> | null;
  firstValue: unknown;
  firstPending: boolean;
  readonly flushFirst: () => void;
}

export function createEventDispatcher(
  runBoundary: EventBoundary = identityBoundary,
): EventDispatcher {
  const queue = createRingQueue<EventDispatchRecord>();

  const dispatcher: EventDispatcherCore = {
    queue,
    flushing: false,
    firstSource: null,
    firstValue: undefined,
    firstPending: false,
    runBoundary,
    flush: () => flushEventDispatcher(dispatcher),
    flushFirst: () => flushFirstEvent(dispatcher),
    emit<T>(source: EventSource<T>, value: T): void {
      if (source.head === null) return;

      if (!dispatcher.flushing && queue.head === queue.tail) {
        dispatcher.firstSource = source as EventSource<unknown>;
        dispatcher.firstValue = value;
        dispatcher.firstPending = true;
        runBoundary(dispatcher.flushFirst);
        return;
      }

      pushRingQueue(queue, {
        source: source as EventSource<unknown>,
        value,
      });
      if (!dispatcher.flushing) runBoundary(dispatcher.flush);
    },
  };

  return dispatcher;
}

export const EventDispatcher = createEventDispatcher;

function flushFirstEvent(dispatcher: EventDispatcherCore): void {
  if (!dispatcher.firstPending) return;

  const source = dispatcher.firstSource!;
  const value = dispatcher.firstValue;

  dispatcher.firstSource = null;
  dispatcher.firstValue = undefined;
  dispatcher.firstPending = false;

  flushEventDispatcher(dispatcher, source, value);
}

function flushEventDispatcher(
  dispatcher: EventDispatcher,
  firstSource?: EventSource<unknown>,
  firstValue?: unknown,
): void {
  if (dispatcher.flushing) return;
  dispatcher.flushing = true;

  try {
    if (firstSource !== undefined) {
      try {
        emitEvent(firstSource, firstValue);
      } finally {
        drainEventQueue(dispatcher.queue);
      }
      return;
    }

    drainEventQueue(dispatcher.queue);
  } finally {
    clearRingQueue(dispatcher.queue);
    dispatcher.flushing = false;
  }
}

function drainEventQueue(queue: RingQueue<EventDispatchRecord>): void {
  while (queue.head !== queue.tail) {
    const record = shiftRingQueue(queue)!;
    emitEvent(record.source, record.value);
  }
}
