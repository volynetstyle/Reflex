import { describe, expect, it, vi } from "vitest";
import {
  type EngineHooks,
  createExecutionContext,
  getReactiveSettledHook,
  setReactiveSettledHook,
} from "../src/reactivity/context";

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
    expect(Object.getPrototypeOf(context)).toBe(Object.prototype);
    expect("polluted" in context).toBe(false);
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
    expect(getReactiveSettledHook()).toBe(undefined);
  });

  it("keeps global hook updates synchronized with cached callbacks", () => {
    const first = vi.fn();
    const second = vi.fn();
    const context = createExecutionContext();

    setReactiveSettledHook(first);
    context.maybeNotifySettled();
    setReactiveSettledHook(second);
    context.maybeNotifySettled();
    setReactiveSettledHook(undefined);
    context.maybeNotifySettled();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(getReactiveSettledHook()).toBe(undefined);
  });
});
