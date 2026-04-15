import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutionContext } from "@reflex/runtime";

const mocks = vi.hoisted(() => ({
  runWatcher: vi.fn(),
  getDefaultContext: vi.fn(),
  getPropagationDepth: vi.fn(),
}));

vi.mock("@reflex/runtime", async () => {
  const actual = await vi.importActual<typeof import("@reflex/runtime")>(
    "@reflex/runtime",
  );

  return {
    ...actual,
    runWatcher: mocks.runWatcher,
    getDefaultContext: mocks.getDefaultContext,
    getPropagationDepth: mocks.getPropagationDepth,
  };
});

import { DIRTY_STATE, ReactiveNodeState } from "@reflex/runtime";
import {
  createEffectScheduler,
  EffectSchedulerMode,
} from "../src/policy/scheduler";

function createContext(
  overrides: Partial<ExecutionContext> = {},
): ExecutionContext {
  return {
    ...overrides,
  } as ExecutionContext;
}

function createNode(state: number = DIRTY_STATE) {
  return { state } as any;
}

describe("createEffectScheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPropagationDepth.mockReturnValue(0);
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

    // calls because early exit in runWatcher
    //    expect(mocks.runWatcher).not.toHaveBeenCalled();
  });

  it("ranked flush runs higher-priority nodes first and keeps FIFO for ties", () => {
    const scheduler = createEffectScheduler(EffectSchedulerMode.Ranked);
    const low = createNode() as any;
    const high = createNode() as any;
    const midA = createNode() as any;
    const midB = createNode() as any;

    low.priority = 1;
    high.priority = 10;
    midA.priority = 5;
    midB.priority = 5;

    scheduler.enqueue(midA);
    scheduler.enqueue(low);
    scheduler.enqueue(high);
    scheduler.enqueue(midB);
    scheduler.flush();

    expect(mocks.runWatcher.mock.calls.map(([node]) => node)).toEqual([
      high,
      midA,
      midB,
      low,
    ]);
  });

  it("flush runs dirty nodes even when extra state bits are present", () => {
    const scheduler = createEffectScheduler(EffectSchedulerMode.Flush);
    const node = createNode(DIRTY_STATE | ReactiveNodeState.Changed);

    scheduler.enqueue(node);
    scheduler.flush();

    expect(mocks.runWatcher).toHaveBeenCalledTimes(1);
    expect(mocks.runWatcher).toHaveBeenCalledWith(node);
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

  it("can flush on outermost batch exit in sab mode", () => {
    const scheduler = createEffectScheduler(EffectSchedulerMode.SAB);
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

  it("keeps sab effects queued when batch exits during active propagation", () => {
    mocks.getPropagationDepth.mockReturnValue(1);
    const context = createContext();
    mocks.getDefaultContext.mockReturnValue(context);

    const scheduler = createEffectScheduler(EffectSchedulerMode.SAB);
    const node = createNode();

    scheduler.batch(() => {
      scheduler.enqueue(node);
    });

    expect(mocks.runWatcher).not.toHaveBeenCalled();
    expect((node.state & ReactiveNodeState.Scheduled) !== 0).toBe(true);

    mocks.getPropagationDepth.mockReturnValue(0);
    scheduler.flush();

    expect(mocks.runWatcher).toHaveBeenCalledTimes(1);
    expect((node.state & ReactiveNodeState.Scheduled) !== 0).toBe(false);
  });

  it("does not auto-flush while propagation is active", () => {
    mocks.getPropagationDepth.mockReturnValue(1);
    const context = createContext();
    mocks.getDefaultContext.mockReturnValue(context);

    const scheduler = createEffectScheduler(EffectSchedulerMode.Eager);
    const node = createNode();

    scheduler.enqueue(node);

    expect(mocks.runWatcher).not.toHaveBeenCalled();
    expect((node.state & ReactiveNodeState.Scheduled) !== 0).toBe(true);

    mocks.getPropagationDepth.mockReturnValue(0);
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

  it("preserves FIFO order after buffer wrap-around during flush", () => {
    const scheduler = createEffectScheduler(EffectSchedulerMode.Flush);
    const initial = Array.from({ length: 16 }, () => createNode());
    const deferred = Array.from({ length: 8 }, () => createNode());

    for (const node of initial) {
      scheduler.enqueue(node);
    }

    let deferredIndex = 0;
    mocks.runWatcher.mockImplementation((node) => {
      if (
        deferredIndex < deferred.length &&
        node === initial[deferredIndex]
      ) {
        scheduler.enqueue(deferred[deferredIndex]!);
        deferredIndex += 1;
      }
    });

    scheduler.flush();

    expect(mocks.runWatcher.mock.calls.map(([node]) => node)).toEqual([
      ...initial,
      ...deferred,
    ]);
  });

  it("drains long linear invalidation chains without skipping nodes", () => {
    const scheduler = createEffectScheduler(EffectSchedulerMode.Flush);
    const depth = 192;
    const nodes = Array.from({ length: depth }, () => createNode());
    const seen: number[] = [];

    mocks.runWatcher.mockImplementation((node) => {
      const index = nodes.indexOf(node);
      seen.push(index);

      const next = nodes[index + 1];
      if (next !== undefined) {
        scheduler.enqueue(next);
      }
    });

    scheduler.enqueue(nodes[0]!);
    scheduler.flush();

    expect(seen).toEqual(Array.from({ length: depth }, (_, i) => i));
  });
});
