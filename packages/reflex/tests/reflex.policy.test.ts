import { describe, expect, it, vi } from "vitest";
import { createWatcherNode } from "../src/infra/factory";
import {
  EffectScheduler,
  EffectSchedulerMode,
  resolveEffectSchedulerMode,
} from "../src/policy/effect_scheduler";
import { EventDispatcher } from "../src/policy/event_dispatcher";
import {
  ReactiveNodeState,
} from "@reflex/runtime";
import type { EventBoundary } from "../src/infra/event";
import { EventSource, subscribeEvent } from "../src/infra/event";

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

  it("can take the guarded auto-flush branch in finally when forced", () => {
    const scheduler = new EffectScheduler(EffectSchedulerMode.Flush) as any;
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
    const boundary: any = vi.fn((flush: () => void) => flush());
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
    const dispatcher = new EventDispatcher((flush): any => {
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
});
