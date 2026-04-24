import { describe, expect, it, vi } from "vitest";
import {
  type EngineHooks,
  enterPropagation,
  getReactiveSettledHook,
  leavePropagation,
  notifySettledIfIdle,
  saveContext,
  restoreContext,
  setHooks,
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

    const previous = saveContext();
    setHooks(payload);
    notifySettledIfIdle();

    expect(settled).toHaveBeenCalledTimes(1);
    restoreContext(previous);
  });

  it("setHooks ignores inherited callbacks on replacement objects", () => {
    const previous = vi.fn();
    const inherited = vi.fn();
    const replacement = Object.create({
      onReactiveSettled: inherited,
    }) as EngineHooks;

    const snapshot = saveContext();
    setHooks({
      onReactiveSettled: previous,
    });
    setHooks(replacement);
    notifySettledIfIdle();

    expect(previous).not.toHaveBeenCalled();
    expect(inherited).not.toHaveBeenCalled();
    expect(getReactiveSettledHook()).toBe(undefined);
    restoreContext(snapshot);
  });

  it("keeps global hook updates synchronized with cached callbacks", () => {
    const first = vi.fn();
    const second = vi.fn();

    setReactiveSettledHook(first);
    notifySettledIfIdle();
    setReactiveSettledHook(second);
    notifySettledIfIdle();
    setReactiveSettledHook(undefined);
    notifySettledIfIdle();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(getReactiveSettledHook()).toBe(undefined);
  });

  it("keeps default settled dispatch synchronized with direct hook updates", () => {
    const previous = getReactiveSettledHook();
    const first = vi.fn();
    const second = vi.fn();

    try {
      setReactiveSettledHook(first);
      enterPropagation();
      leavePropagation();

      setReactiveSettledHook(second);
      enterPropagation();
      leavePropagation();

      setReactiveSettledHook(undefined);
      enterPropagation();
      leavePropagation();
    } finally {
      setReactiveSettledHook(previous);
    }

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(getReactiveSettledHook()).toBe(previous);
  });
});
