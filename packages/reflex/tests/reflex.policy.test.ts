import { describe, expect, it, vi } from "vitest";
import { isEffectScheduled } from "../src/api/effect";
import { createWatcherNode } from "../src/infra/factory";
import {
  EffectScheduler,
  EffectSchedulerMode,
  resolveEffectSchedulerMode,
} from "../src/policy/effect_scheduler";
import { EventDispatcher } from "../src/policy/event_dispatcher";
import {
  createExecutionContext,
  ConsumerReadMode,
  readConsumer,
  readProducer,
  ReactiveNodeState,
  runWatcher,
  writeProducer,
  ReactiveNode,
  CONSUMER_INITIAL_STATE,
  PRODUCER_INITIAL_STATE,
} from "@reflex/runtime";
import type { EventBoundary, EventSubscriber } from "../src/infra/event";
import {
  appendSubscriber,
  emitEvent,
  EventSource,
  EventSubscriberState,
  removeSubscriber,
  subscribeEvent,
} from "../src/infra/event";
import { createRuntime } from "../src/infra/runtime";

function createSubscriber<T>(fn: (value: T) => void): EventSubscriber<T> {
  return {
    fn,
    next: null,
    prev: null,
    state: EventSubscriberState.Active,
    unlinkNext: null,
  };
}

describe("Reactive system - policy helpers", () => {
  it("resolves effect strategy modes", () => {
    expect(resolveEffectSchedulerMode(undefined)).toBe(
      EffectSchedulerMode.Flush,
    );
    expect(resolveEffectSchedulerMode("flush")).toBe(EffectSchedulerMode.Flush);
    expect(resolveEffectSchedulerMode("eager")).toBe(EffectSchedulerMode.Eager);
  });

  it("flush scheduler dedupes enqueues and skips clean reruns", () => {
    const scheduler = new EffectScheduler(EffectSchedulerMode.Flush);
    const spy = vi.fn(() => {});
    const node = createWatcherNode(spy);

    scheduler.enqueue(node);
    scheduler.enqueue(node);
    expect(spy).not.toHaveBeenCalled();

    scheduler.flush();
    expect(spy).toHaveBeenCalledTimes(1);

    scheduler.enqueue(node);
    scheduler.flush();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("eager scheduler flushes after batch exits and reset clears queued work", () => {
    const scheduler = new EffectScheduler(EffectSchedulerMode.Eager);
    const spy = vi.fn(() => {});
    const node = createWatcherNode(spy);

    scheduler.batch(() => {
      scheduler.enqueue(node);
      expect(spy).not.toHaveBeenCalled();
    });
    expect(spy).toHaveBeenCalledTimes(1);

    node.state |= ReactiveNodeState.Changed;

    scheduler.batch(() => {
      scheduler.enqueue(node);
      scheduler.reset();
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("ignores disposed effect nodes", () => {
    const scheduler = new EffectScheduler(EffectSchedulerMode.Flush);
    const spy = vi.fn(() => {});
    const node = createWatcherNode(spy);
    node.state |= ReactiveNodeState.Disposed;

    scheduler.enqueue(node);
    scheduler.flush();

    expect(spy).not.toHaveBeenCalled();
  });

  it("handles nested flush and batch calls during an active flush", () => {
    const scheduler = new EffectScheduler(EffectSchedulerMode.Flush);
    const nested = vi.fn(() => {});
    const node = createWatcherNode(() => {
      scheduler.flush();
      scheduler.batch(() => {
        nested();
      });
    });

    scheduler.enqueue(node);
    scheduler.flush();

    expect(nested).toHaveBeenCalledTimes(1);
  });

  it("restores batching phase after flushing inside an outer batch", () => {
    const scheduler = new EffectScheduler(EffectSchedulerMode.Flush);
    const spy = vi.fn(() => {});
    const node = createWatcherNode(spy);

    scheduler.batch(() => {
      scheduler.enqueue(node);
      scheduler.flush();
    });

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("queues eager invalidations during propagation and flushes them after settle", () => {
    const context = createExecutionContext();
    const scheduler = new EffectScheduler(EffectSchedulerMode.Eager, context);
    const spy = vi.fn(() => {});
    const node = createWatcherNode(spy);
    node.state |= ReactiveNodeState.Changed;
    context.propagationDepth = 1;

    expect(scheduler.canRunImmediately(node)).toBe(false);
    expect(scheduler.scheduleInvalidated(node)).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    expect(isEffectScheduled(node)).toBe(true);

    context.propagationDepth = 0;
    scheduler.notifySettled();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(isEffectScheduled(node)).toBe(false);
  });

  it("preserves queued effects after a flush throws", () => {
    const scheduler = new EffectScheduler(EffectSchedulerMode.Flush);
    const boom = new Error("boom");
    const second = vi.fn(() => {});
    const firstNode = createWatcherNode(() => {
      throw boom;
    });
    const secondNode = createWatcherNode(second);

    scheduler.enqueue(firstNode);
    scheduler.enqueue(secondNode);

    expect(() => scheduler.flush()).toThrow(boom);
    expect(isEffectScheduled(secondNode)).toBe(true);
    expect(second).not.toHaveBeenCalled();

    scheduler.flush();

    expect(second).toHaveBeenCalledTimes(1);
    expect(isEffectScheduled(secondNode)).toBe(false);
  });

  it("scheduler integration invalidates every low-level watcher in a shared branch", () => {
    const invalidated: string[] = [];
    const rt = createRuntime({
      effectStrategy: "eager",
      hooks: {
        onEffectInvalidated(node) {
          if (node === direct) invalidated.push("direct");
          else if (node === left) invalidated.push("left");
          else if (node === right) invalidated.push("right");
        },
      },
    });

    const source = new ReactiveNode(1, null, PRODUCER_INITIAL_STATE);
    const shared = new ReactiveNode(
      0,
      () => readProducer(source, rt.ctx) * 2,
      CONSUMER_INITIAL_STATE,
    );
    const direct = createWatcherNode(() => {
      readProducer(source, rt.ctx);
    });
    const left = createWatcherNode(() => {
      readConsumer(shared, ConsumerReadMode.lazy, rt.ctx);
    });
    const right = createWatcherNode(() => {
      readConsumer(shared, ConsumerReadMode.lazy, rt.ctx);
    });

    readConsumer(shared, ConsumerReadMode.eager, rt.ctx);
    runWatcher(direct, rt.ctx);
    runWatcher(left, rt.ctx);
    runWatcher(right, rt.ctx);

    invalidated.length = 0;
    writeProducer(source, 2, Object.is, rt.ctx);

    expect(invalidated).toEqual(["left", "right", "direct"]);
  });

  it("can take the guarded auto-flush branch in finally when forced", () => {
    const scheduler = new EffectScheduler(EffectSchedulerMode.Flush) as
      EffectScheduler & {
        shouldAutoFlush(): boolean;
      };
    const spy = vi.fn(() => {});
    const node = createWatcherNode(spy);

    scheduler.shouldAutoFlush = () => true;
    scheduler.enqueue(node);
    scheduler.flush();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("subscribes, unsubscribes, and keeps double unsubscribe safe", () => {
    const source = new EventSource<number>();
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = subscribeEvent(source, first);
    const unsubscribeSecond = subscribeEvent(source, second);

    expect(source.head).toBeTruthy();
    expect(source.tail).toBeTruthy();

    unsubscribeFirst();
    unsubscribeFirst();
    unsubscribeSecond();

    expect(source.head).toBeNull();
    expect(source.tail).toBeNull();
  });

  it("dispatches through the boundary once and supports nested emits", () => {
    const source = new EventSource<number>();
    const seen: number[] = [];
    const boundary = vi.fn((flush: () => void) => flush());
    const dispatcher = new EventDispatcher(boundary);

    subscribeEvent(source, (value) => {
      seen.push(value);
      if (value === 1) {
        dispatcher.emit(source, 2);
      }
    });

    dispatcher.emit(source, 1);

    expect(boundary).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([1, 2]);
  });

  it("skips unsubscribed listeners and tolerates empty sources", () => {
    const source = new EventSource<number>();
    const dispatcher = new EventDispatcher();
    const seen: string[] = [];

    let unsubscribeSecond = () => {};
    subscribeEvent(source, (value) => {
      seen.push(`first:${value}`);
      unsubscribeSecond();
    });
    unsubscribeSecond = subscribeEvent(source, (value) => {
      seen.push(`second:${value}`);
    });

    dispatcher.emit(source, 1);
    dispatcher.emit(new EventSource<number>(), 123);

    expect(seen).toEqual(["first:1"]);
  });

  it("skips inactive middle listeners and guards against boundary reentry", () => {
    const source = new EventSource<number>();
    const seen: string[] = [];
    let unsubscribeMiddle = () => {};
    const dispatcher = new EventDispatcher((flush: () => void) => {
      flush();
      flush();
    });

    subscribeEvent(source, (value) => {
      seen.push(`first:${value}`);
      unsubscribeMiddle();
    });
    unsubscribeMiddle = subscribeEvent(source, (value) => {
      seen.push(`middle:${value}`);
    });
    subscribeEvent(source, (value) => {
      seen.push(`last:${value}`);
    });

    dispatcher.emit(source, 1);

    expect(seen).toEqual(["first:1", "last:1"]);
  });

  it("ignores removal attempts for subscribers owned by another source", () => {
    const source = new EventSource<number>();
    const foreignSource = new EventSource<number>();
    const calls: string[] = [];
    const a = createSubscriber<number>(() => calls.push("a"));
    const b = createSubscriber<number>(() => calls.push("b"));
    const foreign = createSubscriber<number>(() => calls.push("foreign"));

    appendSubscriber(source, a);
    appendSubscriber(source, b);
    appendSubscriber(foreignSource, foreign);

    removeSubscriber(source, foreign);

    emitEvent(source, 1);
    emitEvent(foreignSource, 2);

    expect(calls).toEqual(["a", "b", "foreign"]);
    expect(source.head).toBe(a);
    expect(source.tail).toBe(b);
    expect(foreignSource.head).toBe(foreign);
    expect(foreignSource.tail).toBe(foreign);
    expect((foreign.state & EventSubscriberState.Active) !== 0).toBe(true);
  });

  it("does not register the same subscriber in multiple sources", () => {
    const primary = new EventSource<number>();
    const secondary = new EventSource<number>();
    const calls: number[] = [];
    const shared = createSubscriber<number>((value) => calls.push(value));

    appendSubscriber(primary, shared);
    appendSubscriber(secondary, shared);

    emitEvent(primary, 1);
    emitEvent(secondary, 2);

    expect(calls).toEqual([1]);
    expect(primary.head).toBe(shared);
    expect(primary.tail).toBe(shared);
    expect(secondary.head).toBeNull();
    expect(secondary.tail).toBeNull();
    expect(shared.prev).toBeNull();
    expect(shared.next).toBeNull();
  });
});
