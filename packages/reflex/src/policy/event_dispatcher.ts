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
  directSource: EventSource<unknown> | null;
  directValue: unknown;
  readonly runBoundary: EventBoundary;
  readonly flush: () => void;
  readonly flushDirect: () => void;
  emit<T>(source: EventSource<T>, value: T): void;
}

export function createEventDispatcher(
  runBoundary: EventBoundary = identityBoundary,
): EventDispatcher {
  const queue = createRingQueue<EventDispatchRecord>();

  const dispatcher: EventDispatcher = {
    queue,
    flushing: false,
    directSource: null,
    directValue: undefined,
    runBoundary,
    flush: () => flushEventDispatcher(dispatcher),
    flushDirect: () => flushDirectEvent(dispatcher),
    emit<T>(source: EventSource<T>, value: T): void {
      if (!dispatcher.flushing && queue.head === queue.tail) {
        dispatcher.directSource = source as EventSource<unknown>;
        dispatcher.directValue = value;
        runBoundary(dispatcher.flushDirect);
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

function flushDirectEvent(dispatcher: EventDispatcher): void {
  const source = dispatcher.directSource;
  if (source === null) return;

  const value = dispatcher.directValue;
  dispatcher.directSource = null;
  dispatcher.directValue = undefined;
  dispatcher.flushing = true;

  try {
    emitEvent(source, value);
  } finally {
    dispatcher.flushing = false;

    if (dispatcher.queue.head !== dispatcher.queue.tail) dispatcher.flush();
  }
}

function flushEventDispatcher(dispatcher: EventDispatcher): void {
  if (dispatcher.flushing) return;
  dispatcher.flushing = true;

  try {
    while (dispatcher.queue.head !== dispatcher.queue.tail) {
      const record = shiftRingQueue(dispatcher.queue)!;
      emitEvent(record.source, record.value);
    }
  } finally {
    clearRingQueue(dispatcher.queue);
    dispatcher.flushing = false;
  }
}
