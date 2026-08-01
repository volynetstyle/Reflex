import { describe, expect, it, vi } from "vitest";
import {
  type RuntimeHostHooks,
  getActiveRuntimeContext,
  snapshotRuntimeContext,
  restoreRuntimeContextSnapshot,
  configureRuntimeContext,
} from "../../../src/kernel/context";
import { runtimeIdleHook } from "../../../src/kernel/config";
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
    Object.defineProperty(payload, "onRuntimeIdle", {
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
      onRuntimeIdle: inherited,
    }) as RuntimeHostHooks;

    const snapshot = snapshotRuntimeContext();
    configureRuntimeContext({
      hooks: { onRuntimeIdle: previous },
    });
    configureRuntimeContext({ hooks: replacement });
    emitSettledIfIdle();

    expect(previous).not.toHaveBeenCalled();
    expect(inherited).not.toHaveBeenCalled();
    expect(runtimeIdleHook).toBe(undefined);
    restoreRuntimeContextSnapshot(getActiveRuntimeContext(), snapshot);
  });

  it("keeps global hook updates synchronized with cached callbacks", () => {
    const first = vi.fn();
    const second = vi.fn();

    configureRuntimeContext({ hooks: { onRuntimeIdle: first } });
    emitSettledIfIdle();
    configureRuntimeContext({ hooks: { onRuntimeIdle: second } });
    emitSettledIfIdle();
    configureRuntimeContext({ hooks: {} });
    emitSettledIfIdle();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(runtimeIdleHook).toBe(undefined);
  });

  it("keeps default settled dispatch synchronized with direct hook updates", () => {
    const previous = runtimeIdleHook;
    const first = vi.fn();
    const second = vi.fn();

    try {
      configureRuntimeContext({ hooks: { onRuntimeIdle: first } });
      enterPropagationScope();
      leavePropagationScope();

      configureRuntimeContext({ hooks: { onRuntimeIdle: second } });
      enterPropagationScope();
      leavePropagationScope();

      configureRuntimeContext({ hooks: {} });
      enterPropagationScope();
      leavePropagationScope();
    } finally {
      configureRuntimeContext({
        hooks: { onRuntimeIdle: previous },
      });
    }

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(runtimeIdleHook).toBe(previous);
  });
});
