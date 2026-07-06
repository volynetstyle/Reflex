import { describe, expect, it, vi } from "vitest";
import {
  type RuntimeHostHooks,
  getActiveRuntimeContext,
  snapshotRuntimeContext,
  restoreRuntimeContextSnapshot,
  configureRuntimeContext,
} from "../../../src/kernel/context";
import { reactiveSettledHook } from "../../../src/kernel/config";
import {
  emitSettledIfIdle,
  enterPropagationScope,
  leavePropagationScope,
} from "../../../src/kernel/context.scope";

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

    const previous = snapshotRuntimeContext();
    configureRuntimeContext({ hooks: payload });
    emitSettledIfIdle();

    expect(settled).toHaveBeenCalledTimes(1);
    restoreRuntimeContextSnapshot(getActiveRuntimeContext(), previous);
  });

  it("configureRuntimeContext ignores inherited callbacks on replacement objects", () => {
    const previous = vi.fn();
    const inherited = vi.fn();
    const replacement = Object.create({
      reactiveSettledDispatcher: inherited,
    }) as RuntimeHostHooks;

    const snapshot = snapshotRuntimeContext();
    configureRuntimeContext({
      hooks: { reactiveSettledDispatcher: previous },
    });
    configureRuntimeContext({ hooks: replacement });
    emitSettledIfIdle();

    expect(previous).not.toHaveBeenCalled();
    expect(inherited).not.toHaveBeenCalled();
    expect(reactiveSettledHook).toBe(undefined);
    restoreRuntimeContextSnapshot(getActiveRuntimeContext(), snapshot);
  });

  it("keeps global hook updates synchronized with cached callbacks", () => {
    const first = vi.fn();
    const second = vi.fn();

    configureRuntimeContext({ hooks: { reactiveSettledDispatcher: first } });
    emitSettledIfIdle();
    configureRuntimeContext({ hooks: { reactiveSettledDispatcher: second } });
    emitSettledIfIdle();
    configureRuntimeContext({ hooks: {} });
    emitSettledIfIdle();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(reactiveSettledHook).toBe(undefined);
  });

  it("keeps default settled dispatch synchronized with direct hook updates", () => {
    const previous = reactiveSettledHook;
    const first = vi.fn();
    const second = vi.fn();

    try {
      configureRuntimeContext({ hooks: { reactiveSettledDispatcher: first } });
      enterPropagationScope();
      leavePropagationScope();

      configureRuntimeContext({ hooks: { reactiveSettledDispatcher: second } });
      enterPropagationScope();
      leavePropagationScope();

      configureRuntimeContext({ hooks: {} });
      enterPropagationScope();
      leavePropagationScope();
    } finally {
      configureRuntimeContext({
        hooks: { reactiveSettledDispatcher: previous },
      });
    }

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(reactiveSettledHook).toBe(previous);
  });
});
