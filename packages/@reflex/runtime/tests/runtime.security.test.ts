import { describe, expect, it, vi } from "vitest";
import {
  type EngineHooks,
  createExecutionContext,
} from "../src/reactivity/context";
import {
  EventSource,
  EventSubscriberState,
  appendSubscriber,
  emitEvent,
  removeSubscriber,
  type EventSubscriber,
} from "../src/reactivity/shape/ReactiveEvent";

function createSubscriber<T>(fn: (value: T) => void): EventSubscriber<T> {
  return {
    fn,
    next: null,
    prev: null,
    state: EventSubscriberState.Active,
    unlinkNext: null,
  };
}

describe("Reactive runtime - security regressions", () => {
  it("normalizes hook payloads instead of inheriting __proto__ pollution", () => {
    const settled = vi.fn();
    const payload = Object.create(null) as EngineHooks & Record<string, unknown>;

    Object.defineProperty(payload, "__proto__", {
      enumerable: true,
      value: { polluted: true },
    });
    Object.defineProperty(payload, "onReactiveSettled", {
      enumerable: true,
      value: settled,
    });

    const context = createExecutionContext(payload);

    context.maybeNotifySettled();

    expect(settled).toHaveBeenCalledTimes(1);
    expect(Object.getPrototypeOf(context.hooks)).toBe(Object.prototype);
    expect("polluted" in context.hooks).toBe(false);
    expect((context.hooks as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("setHooks ignores inherited callbacks on replacement objects", () => {
    const previous = vi.fn();
    const inherited = vi.fn();
    const context = createExecutionContext({
      onReactiveSettled: previous,
    });
    const replacement = Object.create({
      onReactiveSettled: inherited,
    }) as EngineHooks;

    context.setHooks(replacement);
    context.maybeNotifySettled();

    expect(previous).not.toHaveBeenCalled();
    expect(inherited).not.toHaveBeenCalled();
    expect(Object.hasOwn(context.hooks, "onReactiveSettled")).toBe(false);
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
