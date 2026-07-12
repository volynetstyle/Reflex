import { beforeEach, describe, expect, it, vi } from "vitest";
import * as publicRuntime from "../../../src";
import {
  createRuntimeContext,
  getActiveRuntimeContext,
  restoreRuntimeContextSnapshot,
  runWithRuntimeContext,
  snapshotRuntimeContext,
  configureRuntimeContext,
} from "../../../src/kernel/context";
import { switchRuntimeContext } from "../../../src/kernel/context.switch";
import { emitSinkInvalidated } from "../../../src/kernel/config";
import {
  emitSettledIfIdle,
  enterPropagationScope,
  leavePropagationScope,
} from "../../../src/kernel/context.scope";
import {
  currentConsumer,
  keepNewestTrackingEpoch,
  propagationScopeDepth,
  setCurrentConsumer,
  trackingEpoch,
} from "../../../src/kernel/state";
import { resetRuntimeContext } from "../../../src/kernel/context";
import { createConsumer, resetRuntime } from "../../runtime.test_utils";

describe("execution state", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it("exposes context intent without exposing runtime machinery", () => {
    expect(publicRuntime).toMatchObject({
      configureRuntimeContext: expect.any(Function),
      createRuntimeContext: expect.any(Function),
      getActiveRuntimeContext: expect.any(Function),
      resetRuntimeContext: expect.any(Function),
      restoreRuntimeContextSnapshot: expect.any(Function),
      runWithRuntimeContext: expect.any(Function),
      snapshotRuntimeContext: expect.any(Function),
    });

    for (const internalName of [
      "currentConsumer",
      "enterReactiveBatch",
      "setCurrentConsumer",
      "switchRuntimeContext",
      "syncRuntimeContext",
      "trackingEpoch",
    ]) {
      expect(publicRuntime).not.toHaveProperty(internalName);
    }
  });

  it("restores previous state after runWithExecutionState", () => {
    const previous = getActiveRuntimeContext();
    const next = createRuntimeContext();

    runWithRuntimeContext(next, () => {
      expect(getActiveRuntimeContext()).toBe(next);
    });

    expect(getActiveRuntimeContext()).toBe(previous);
  });

  it("supports nested runWithExecutionState", () => {
    const outer = createRuntimeContext();
    const inner = createRuntimeContext();

    runWithRuntimeContext(outer, () => {
      expect(getActiveRuntimeContext()).toBe(outer);

      runWithRuntimeContext(inner, () => {
        expect(getActiveRuntimeContext()).toBe(inner);
      });

      expect(getActiveRuntimeContext()).toBe(outer);
    });
  });

  it("keeps activeConsumer isolated per state", () => {
    const first = createRuntimeContext();
    const second = createRuntimeContext();
    const firstConsumer = createConsumer(() => 1);
    const secondConsumer = createConsumer(() => 2);

    runWithRuntimeContext(first, () => {
      setCurrentConsumer(firstConsumer);
    });
    runWithRuntimeContext(second, () => {
      setCurrentConsumer(secondConsumer);
    });

    runWithRuntimeContext(first, () => {
      expect(currentConsumer).toBe(firstConsumer);
    });
    runWithRuntimeContext(second, () => {
      expect(currentConsumer).toBe(secondConsumer);
    });
  });

  it("keeps propagationDepth isolated per state", () => {
    const first = createRuntimeContext();
    const second = createRuntimeContext();

    runWithRuntimeContext(first, () => {
      enterPropagationScope();
      enterPropagationScope();
    });
    runWithRuntimeContext(second, () => {
      enterPropagationScope();
    });

    runWithRuntimeContext(first, () => {
      expect(propagationScopeDepth).toBe(2);
    });
    runWithRuntimeContext(second, () => {
      expect(propagationScopeDepth).toBe(1);
    });
  });

  it("dispatches the configured runtime invalidation hook", () => {
    const order: string[] = [];
    const node = createConsumer(() => 1);

    configureRuntimeContext({
      hooks: { sinkInvalidatedDispatcher: () => order.push("runtime") },
    });

    emitSinkInvalidated(node);

    expect(order).toEqual(["runtime"]);
  });

  it("does not dispatch settled while propagationDepth > 0", () => {
    const settled = vi.fn();

    configureRuntimeContext({ hooks: { reactiveSettledDispatcher: settled } });
    enterPropagationScope();
    emitSettledIfIdle();

    expect(settled).not.toHaveBeenCalled();
  });

  it("does not dispatch settled while activeConsumer exists", () => {
    const settled = vi.fn();
    const consumer = createConsumer(() => 1);

    configureRuntimeContext({ hooks: { reactiveSettledDispatcher: settled } });
    setCurrentConsumer(consumer);
    emitSettledIfIdle();

    expect(settled).not.toHaveBeenCalled();
  });

  it("dispatches settled after leaving outermost propagation", () => {
    const settled = vi.fn();

    configureRuntimeContext({ hooks: { reactiveSettledDispatcher: settled } });
    enterPropagationScope();
    enterPropagationScope();
    leavePropagationScope();

    expect(settled).not.toHaveBeenCalled();

    leavePropagationScope();

    expect(settled).toHaveBeenCalledTimes(1);
  });

  it("does not rollback trackingVersion on restore", () => {
    const context = createRuntimeContext();

    switchRuntimeContext(context);
    keepNewestTrackingEpoch(1);
    const snapshot = snapshotRuntimeContext(context);

    keepNewestTrackingEpoch(3);
    restoreRuntimeContextSnapshot(context, snapshot);

    expect(trackingEpoch).toBe(3);
    expect(context.trackingEpoch).toBe(3);
  });

  it("resets active mirrors when active state is reset", () => {
    const context = createRuntimeContext();
    const consumer = createConsumer(() => 1);

    switchRuntimeContext(context);
    setCurrentConsumer(consumer);
    enterPropagationScope();
    keepNewestTrackingEpoch(2);

    resetRuntimeContext(context);

    expect(currentConsumer).toBe(null);
    expect(propagationScopeDepth).toBe(0);
    expect(trackingEpoch).toBe(0);
  });
});
