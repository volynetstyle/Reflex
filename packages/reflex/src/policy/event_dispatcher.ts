import type { EventBoundary, EventSource } from "../infra/event";
import { identityBoundary, emitEvent } from "../infra/event";
import { createRingQueue } from "./scheduler/scheduler.queue";
import { attachQueueState } from "./scheduler/scheduler.instance";
import type { QueueBacked } from "./scheduler";

type EventDispatchRecord = {
  source: EventSource<unknown>;
  value: unknown;
};

export interface EventDispatcher extends QueueBacked<EventDispatchRecord> {
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

  const dispatcher = attachQueueState(
    {
      queue,
      flushing: false as boolean,
      directSource: null as EventSource<unknown> | null,
      directValue: undefined as unknown,
      runBoundary,
      flush: () => flushEventDispatcher(dispatcher),
      flushDirect: () => flushDirectEvent(dispatcher),
      emit<T>(source: EventSource<T>, value: T): void {
        if (!dispatcher.flushing && queue.size === 0) {
          dispatcher.directSource = source as EventSource<unknown>;
          dispatcher.directValue = value;
          runBoundary(dispatcher.flushDirect);
          return;
        }

        queue.push({
          source: source as EventSource<unknown>,
          value,
        });
        if (!dispatcher.flushing) runBoundary(dispatcher.flush);
      },
    },
    queue,
  ) satisfies EventDispatcher;

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

    if (dispatcher.queue.size !== 0) dispatcher.flush();
  }
}

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
