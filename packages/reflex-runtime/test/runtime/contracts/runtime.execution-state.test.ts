import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRuntimeContext,
  currentConsumer,
  emitSettledIfIdle,
  emitSinkInvalidated,
  enterPropagationScope,
  getActiveRuntimeContext,
  leavePropagationScope,
  propagationScopeDepth,
  restoreRuntimeContext,
  runWithRuntimeContext,
  saveRuntimeContext,
  setActiveRuntimeContext,
  setCurrentConsumer,
  setHostHooks,
  setInternalHooks,
  setTrackingEpoch,
  trackingEpoch,
} from "../../../src/kernel/context";
import { resetState } from "../../../src/kernel/execution";
import { createConsumer, resetRuntime } from "../../runtime.test_utils";

describe("execution state", () => {
  beforeEach(() => {
    resetRuntime();
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

  it("dispatches runtime hooks before external hooks", () => {
    const order: string[] = [];
    const node = createConsumer(() => 1);

    setInternalHooks(() => order.push("runtime"));
    setHostHooks({ sinkInvalidatedDispatcher: () => order.push("external") });

    emitSinkInvalidated(node);

    expect(order).toEqual(["runtime", "external"]);
  });

  it("does not dispatch settled while propagationDepth > 0", () => {
    const settled = vi.fn();

    setHostHooks({ reactiveSettledDispatcher: settled });
    enterPropagationScope();
    emitSettledIfIdle();

    expect(settled).not.toHaveBeenCalled();
  });

  it("does not dispatch settled while activeConsumer exists", () => {
    const settled = vi.fn();
    const consumer = createConsumer(() => 1);

    setHostHooks({ reactiveSettledDispatcher: settled });
    setCurrentConsumer(consumer);
    emitSettledIfIdle();

    expect(settled).not.toHaveBeenCalled();
  });

  it("dispatches settled after leaving outermost propagation", () => {
    const settled = vi.fn();

    setHostHooks({ reactiveSettledDispatcher: settled });
    enterPropagationScope();
    enterPropagationScope();
    leavePropagationScope();

    expect(settled).not.toHaveBeenCalled();

    leavePropagationScope();

    expect(settled).toHaveBeenCalledTimes(1);
  });

  it("does not rollback trackingVersion on restore", () => {
    const context = createRuntimeContext();

    setActiveRuntimeContext(context);
    setTrackingEpoch(1);
    const snapshot = saveRuntimeContext(context);

    setTrackingEpoch(3);
    restoreRuntimeContext(context, snapshot);

    expect(trackingEpoch).toBe(3);
    expect(context.trackingEpoch).toBe(3);
  });

  it("resets active mirrors when active state is reset", () => {
    const context = createRuntimeContext();
    const consumer = createConsumer(() => 1);

    setActiveRuntimeContext(context);
    setCurrentConsumer(consumer);
    enterPropagationScope();
    setTrackingEpoch(2);

    resetState(context);

    expect(currentConsumer).toBe(null);
    expect(propagationScopeDepth).toBe(0);
    expect(trackingEpoch).toBe(0);
  });
});
