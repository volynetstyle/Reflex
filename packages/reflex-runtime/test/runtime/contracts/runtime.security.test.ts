import { describe, expect, it, vi } from "vitest";
import {
  type RuntimeHostHooks,
  enterPropagationScope,
  getReactiveSettledHook,
  leavePropagationScope,
  emitSettledIfIdle,
  saveContext,
  restoreContext,
  setHostHooks,
  setReactiveSettledHook,
} from "../../../src/kernel/context";

/** Covers security-sensitive hook normalization and replacement behavior. */
describe("Reactive runtime - security regressions", () => {
  it("normalizes hook payloads instead of inheriting __proto__ pollution", () => {
    const settled = vi.fn();
    const payload = Object.create(null) as RuntimeHostHooks &
      Record<string, unknown>;

    Object.defineProperty(payload, "__proto__", {
      enumerable: true,
      value: { polluted: true },
    });
    Object.defineProperty(payload, "reactiveSettledDispatcher", {
      enumerable: true,
      value: settled,
    });

    const previous = saveContext();
    setHostHooks(payload);
    emitSettledIfIdle();

    expect(settled).toHaveBeenCalledTimes(1);
    restoreContext(previous);
  });

  it("setHostHooks ignores inherited callbacks on replacement objects", () => {
    const previous = vi.fn();
    const inherited = vi.fn();
    const replacement = Object.create({
      reactiveSettledDispatcher: inherited,
    }) as RuntimeHostHooks;

    const snapshot = saveContext();
    setHostHooks({
      reactiveSettledDispatcher: previous,
    });
    setHostHooks(replacement);
    emitSettledIfIdle();

    expect(previous).not.toHaveBeenCalled();
    expect(inherited).not.toHaveBeenCalled();
    expect(getReactiveSettledHook()).toBe(undefined);
    restoreContext(snapshot);
  });

  it("keeps global hook updates synchronized with cached callbacks", () => {
    const first = vi.fn();
    const second = vi.fn();

    setReactiveSettledHook(first);
    emitSettledIfIdle();
    setReactiveSettledHook(second);
    emitSettledIfIdle();
    setReactiveSettledHook(undefined);
    emitSettledIfIdle();

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
      enterPropagationScope();
      leavePropagationScope();

      setReactiveSettledHook(second);
      enterPropagationScope();
      leavePropagationScope();

      setReactiveSettledHook(undefined);
      enterPropagationScope();
      leavePropagationScope();
    } finally {
      setReactiveSettledHook(previous);
    }

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(getReactiveSettledHook()).toBe(previous);
  });
});



