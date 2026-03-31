import { describe, expect, it, vi } from "vitest";
import {
  type EngineHooks,
  createExecutionContext,
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
    expect(context.hooks.onReactiveSettled).toBe(undefined);
  });
});
