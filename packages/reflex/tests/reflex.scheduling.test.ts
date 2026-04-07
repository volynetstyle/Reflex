import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutionContext } from "@reflex/runtime";

const mocks = vi.hoisted(() => ({
  runWatcher: vi.fn(),
  getDefaultContext: vi.fn(),
}));

vi.mock("@reflex/runtime", async () => {
  const actual = await vi.importActual<typeof import("@reflex/runtime")>(
    "@reflex/runtime",
  );

  return {
    ...actual,
    runWatcher: mocks.runWatcher,
    getDefaultContext: mocks.getDefaultContext,
  };
});

import {
  DIRTY_STATE,
  ReactiveNodeState,
} from "@reflex/runtime";
import {
  createEffectScheduler,
  EffectSchedulerMode,
} from "../src/policy/effect_scheduler";

function createContext(
  overrides: Partial<ExecutionContext> = {},
): ExecutionContext {
  return {
    propagationDepth: 0,
    activeComputed: null,
    ...overrides,
  } as ExecutionContext;
}

function createNode(state: number = DIRTY_STATE) {
  return { state } as any;
}

describe("createEffectScheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDefaultContext.mockReturnValue(createContext());
  });

  it("enqueue marks node as scheduled in flush mode but does not run it", () => {
    const scheduler = createEffectScheduler(EffectSchedulerMode.Flush);
    const node = createNode();

    scheduler.enqueue(node);

    expect((node.state & ReactiveNodeState.Scheduled) !== 0).toBe(true);
    expect(mocks.runWatcher).not.toHaveBeenCalled();
  });

  it("flush unschedules and runs dirty node", () => {
    const scheduler = createEffectScheduler(EffectSchedulerMode.Flush);
    const node = createNode();

    scheduler.enqueue(node);
    scheduler.flush();

    expect((node.state & ReactiveNodeState.Scheduled) !== 0).toBe(false);
    expect(mocks.runWatcher).toHaveBeenCalledTimes(1);
    expect(mocks.runWatcher).toHaveBeenCalledWith(node);
  });

  it("flush unschedules but does not run clean node", () => {
    const scheduler = createEffectScheduler(EffectSchedulerMode.Flush);
    const node = createNode();

    scheduler.enqueue(node);
    node.state &= ~DIRTY_STATE;

    scheduler.flush();

    expect((node.state & ReactiveNodeState.Scheduled) !== 0).toBe(false);
    expect(mocks.runWatcher).not.toHaveBeenCalled();
  });

  it("runs immediately in eager mode when context is idle", () => {
    const scheduler = createEffectScheduler(EffectSchedulerMode.Eager);
    const node = createNode();

    scheduler.enqueue(node);

    expect(mocks.runWatcher).toHaveBeenCalledTimes(1);
    expect((node.state & ReactiveNodeState.Scheduled) !== 0).toBe(false);
  });

  it("defers eager flush until batch exits", () => {
    const scheduler = createEffectScheduler(EffectSchedulerMode.Eager);
    const a = createNode();
    const b = createNode();

    scheduler.batch(() => {
      scheduler.enqueue(a);
      scheduler.enqueue(b);

      expect(mocks.runWatcher).not.toHaveBeenCalled();
      expect((a.state & ReactiveNodeState.Scheduled) !== 0).toBe(true);
      expect((b.state & ReactiveNodeState.Scheduled) !== 0).toBe(true);
    });

    expect(mocks.runWatcher).toHaveBeenCalledTimes(2);
    expect((a.state & ReactiveNodeState.Scheduled) !== 0).toBe(false);
    expect((b.state & ReactiveNodeState.Scheduled) !== 0).toBe(false);
  });

  it("does not auto-flush while propagation is active", () => {
    mocks.getDefaultContext.mockReturnValue(
      createContext({ propagationDepth: 1 }),
    );

    const scheduler = createEffectScheduler(EffectSchedulerMode.Eager);
    const node = createNode();

    scheduler.enqueue(node);

    expect(mocks.runWatcher).not.toHaveBeenCalled();
    expect((node.state & ReactiveNodeState.Scheduled) !== 0).toBe(true);

    mocks.getDefaultContext.mockReturnValue(createContext());
    scheduler.notifySettled();

    expect(mocks.runWatcher).toHaveBeenCalledTimes(1);
    expect((node.state & ReactiveNodeState.Scheduled) !== 0).toBe(false);
  });

  it("ignores disposed nodes on enqueue", () => {
    const scheduler = createEffectScheduler(EffectSchedulerMode.Flush);
    const node = createNode(DIRTY_STATE | ReactiveNodeState.Disposed);

    scheduler.enqueue(node);
    scheduler.flush();

    expect((node.state & ReactiveNodeState.Scheduled) !== 0).toBe(false);
    expect(mocks.runWatcher).not.toHaveBeenCalled();
  });

  it("reset clears pending queue", () => {
    const scheduler = createEffectScheduler(EffectSchedulerMode.Flush);
    const node = createNode();

    scheduler.enqueue(node);
    scheduler.reset();
    scheduler.flush();

    expect(mocks.runWatcher).not.toHaveBeenCalled();
    expect((node.state & ReactiveNodeState.Scheduled) !== 0).toBe(false);
  });

  it("reset allows previously queued node to be scheduled again", () => {
  const scheduler = createEffectScheduler(EffectSchedulerMode.Flush);
  const node = createNode();

  scheduler.enqueue(node);
  scheduler.reset();

  scheduler.enqueue(node);
  scheduler.flush();

  expect(mocks.runWatcher).toHaveBeenCalledTimes(1);
});
});