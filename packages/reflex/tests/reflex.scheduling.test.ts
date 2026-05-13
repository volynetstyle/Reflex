/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Changed,
  resetState,
  Scheduled,
  setPropagationDepth,
} from "@volynets/reflex-runtime";
import { createWatcherNode } from "../src/infra/factory";
import {
  createEffectScheduler,
  EffectSchedulerMode,
} from "../src/policy/scheduler";

type TestNode = ReturnType<typeof createWatcherNode> & { priority?: number };

let calls: TestNode[];

function createNode(fn: () => void = (): void => {}): TestNode {
  let node!: TestNode;
  node = createWatcherNode(() => {
    calls.push(node);
    fn();
  }) as TestNode;
  return node;
}

describe("createEffectScheduler", () => {
  beforeEach(() => {
    calls = [];
    resetState();
    setPropagationDepth(0);
  });

  it("enqueue marks node as scheduled in flush mode but does not run it", () => {
    const scheduler = createEffectScheduler(EffectSchedulerMode.Flush);
    const node = createNode();

    scheduler.enqueue(node);

    expect((node.state & Scheduled) !== 0).toBe(true);
    expect(calls).toEqual([]);
  });

  it("flush unschedules and runs dirty node", () => {
    const scheduler = createEffectScheduler(EffectSchedulerMode.Flush);
    const node = createNode();

    scheduler.enqueue(node);
    scheduler.flush();

    expect((node.state & Scheduled) !== 0).toBe(false);
    expect(calls).toEqual([node]);
  });

  it("flush preserves FIFO order without sorting by priority", () => {
    const scheduler = createEffectScheduler(EffectSchedulerMode.Flush);
    const normal = createNode();
    const high = createNode();
    high.priority = 1;

    scheduler.enqueue(normal);
    scheduler.enqueue(high);
    scheduler.flush();

    expect(calls).toEqual([normal, high]);
  });

  it("ranked flush runs higher-priority nodes first and keeps FIFO for ties", () => {
    const scheduler = createEffectScheduler(EffectSchedulerMode.Ranked);
    const low = createNode();
    const high = createNode();
    const midA = createNode();
    const midB = createNode();

    low.priority = 1;
    high.priority = 10;
    midA.priority = 5;
    midB.priority = 5;

    scheduler.enqueue(midA);
    scheduler.enqueue(low);
    scheduler.enqueue(high);
    scheduler.enqueue(midB);
    scheduler.flush();

    expect(calls).toEqual([high, midA, midB, low]);
  });

  it("ranked flush handles sparse priority ranges without losing order", () => {
    const scheduler = createEffectScheduler(EffectSchedulerMode.Ranked);
    const low = createNode();
    const mid = createNode();
    const high = createNode();

    low.priority = 1;
    mid.priority = 10_000;
    high.priority = 1_000_000;

    scheduler.enqueue(low);
    scheduler.enqueue(high);
    scheduler.enqueue(mid);
    scheduler.flush();

    expect(calls).toEqual([high, mid, low]);
  });

  it("ranked flush drains newly enqueued nodes after the current priority wave", () => {
    const scheduler = createEffectScheduler(EffectSchedulerMode.Ranked);
    const late = createNode();
    const high = createNode(() => scheduler.enqueue(late));
    const low = createNode();

    high.priority = 10;
    low.priority = 1;
    late.priority = 5;

    scheduler.enqueue(low);
    scheduler.enqueue(high);
    scheduler.flush();

    expect(calls).toEqual([high, low, late]);
  });

  it("flush runs dirty nodes even when extra state bits are present", () => {
    const scheduler = createEffectScheduler(EffectSchedulerMode.Flush);
    const node = createNode();
    node.state |= Changed;

    scheduler.enqueue(node);
    scheduler.flush();

    expect(calls).toEqual([node]);
  });

  it("runs immediately in eager mode when context is idle", () => {
    const scheduler = createEffectScheduler(EffectSchedulerMode.Eager);
    const node = createNode();

    scheduler.enqueue(node);

    expect(calls).toEqual([node]);
    expect((node.state & Scheduled) !== 0).toBe(false);
  });

  it("defers eager flush until batch exits", () => {
    const scheduler = createEffectScheduler(EffectSchedulerMode.Eager);
    const a = createNode();
    const b = createNode();

    scheduler.batch(() => {
      scheduler.enqueue(a);
      scheduler.enqueue(b);

      expect(calls).toEqual([]);
      expect((a.state & Scheduled) !== 0).toBe(true);
      expect((b.state & Scheduled) !== 0).toBe(true);
    });

    expect(calls).toEqual([a, b]);
    expect((a.state & Scheduled) !== 0).toBe(false);
    expect((b.state & Scheduled) !== 0).toBe(false);
  });

  it("keeps flush mode effects queued after batch until explicit flush", () => {
    const scheduler = createEffectScheduler(EffectSchedulerMode.Flush);
    const node = createNode();

    scheduler.batch(() => {
      scheduler.enqueue(node);
      expect(calls).toEqual([]);
      expect((node.state & Scheduled) !== 0).toBe(true);
    });

    expect(calls).toEqual([]);
    expect((node.state & Scheduled) !== 0).toBe(true);

    scheduler.flush();

    expect(calls).toEqual([node]);
    expect((node.state & Scheduled) !== 0).toBe(false);
  });

  it("keeps sab mode effects queued after ordinary enqueue until explicit flush", () => {
    const scheduler = createEffectScheduler(EffectSchedulerMode.SAB);
    const node = createNode();

    scheduler.enqueue(node);

    expect(calls).toEqual([]);
    expect((node.state & Scheduled) !== 0).toBe(true);

    scheduler.flush();

    expect(calls).toEqual([node]);
    expect((node.state & Scheduled) !== 0).toBe(false);
  });

  it("can flush on outermost batch exit in sab mode", () => {
    const scheduler = createEffectScheduler(EffectSchedulerMode.SAB);
    const a = createNode();
    const b = createNode();

    scheduler.batch(() => {
      scheduler.enqueue(a);
      scheduler.enqueue(b);

      expect(calls).toEqual([]);
      expect((a.state & Scheduled) !== 0).toBe(true);
      expect((b.state & Scheduled) !== 0).toBe(true);
    });

    expect(calls).toEqual([a, b]);
    expect((a.state & Scheduled) !== 0).toBe(false);
    expect((b.state & Scheduled) !== 0).toBe(false);
  });

  it("does not flush sab mode at nested batch exit", () => {
    const scheduler = createEffectScheduler(EffectSchedulerMode.SAB);
    const node = createNode();

    scheduler.batch(() => {
      scheduler.batch(() => {
        scheduler.enqueue(node);
      });

      expect(calls).toEqual([]);
      expect((node.state & Scheduled) !== 0).toBe(true);
    });

    expect(calls).toEqual([node]);
    expect((node.state & Scheduled) !== 0).toBe(false);
  });

  it("keeps sab effects queued when batch exits during active propagation", () => {
    setPropagationDepth(1);
    const scheduler = createEffectScheduler(EffectSchedulerMode.SAB);
    const node = createNode();

    scheduler.batch(() => {
      scheduler.enqueue(node);
    });

    expect(calls).toEqual([]);
    expect((node.state & Scheduled) !== 0).toBe(true);

    setPropagationDepth(0);
    scheduler.flush();

    expect(calls).toEqual([node]);
    expect((node.state & Scheduled) !== 0).toBe(false);
  });

  it("does not auto-flush while propagation is active", () => {
    setPropagationDepth(1);
    const scheduler = createEffectScheduler(EffectSchedulerMode.Eager);
    const node = createNode();

    scheduler.enqueue(node);

    expect(calls).toEqual([]);
    expect((node.state & Scheduled) !== 0).toBe(true);

    setPropagationDepth(0);
    scheduler.notifySettled();

    expect(calls).toEqual([node]);
    expect((node.state & Scheduled) !== 0).toBe(false);
  });

  it("reset clears pending queue", () => {
    const scheduler = createEffectScheduler(EffectSchedulerMode.Flush);
    const node = createNode();

    scheduler.enqueue(node);
    scheduler.reset();
    scheduler.flush();

    expect(calls).toEqual([]);
    expect((node.state & Scheduled) !== 0).toBe(false);
  });

  it("reset allows previously queued node to be scheduled again", () => {
    const scheduler = createEffectScheduler(EffectSchedulerMode.Flush);
    const node = createNode();

    scheduler.enqueue(node);
    scheduler.reset();

    scheduler.enqueue(node);
    scheduler.flush();

    expect(calls).toEqual([node]);
  });

  it("preserves FIFO order after buffer wrap-around during flush", () => {
    const scheduler = createEffectScheduler(EffectSchedulerMode.Flush);
    const deferred: TestNode[] = [];
    const initial = Array.from({ length: 16 }, (_, index) =>
      createNode(() => {
        if (index < 8) {
          scheduler.enqueue(deferred[index]!);
        }
      }),
    );

    for (let index = 0; index < 8; index++) {
      deferred.push(createNode());
    }

    for (const node of initial) {
      scheduler.enqueue(node);
    }

    scheduler.flush();

    expect(calls).toEqual([...initial, ...deferred]);
  });

  it("drains long linear invalidation chains without skipping nodes", () => {
    const scheduler = createEffectScheduler(EffectSchedulerMode.Flush);
    const depth = 192;
    const nodes: TestNode[] = [];

    for (let index = 0; index < depth; index++) {
      nodes.push(createNode(() => {
        const next = nodes[index + 1];
        if (next !== undefined) scheduler.enqueue(next);
      }));
    }

    scheduler.enqueue(nodes[0]!);
    scheduler.flush();

    expect(calls).toEqual(nodes);
  });

  it("flush mode continues draining queued nodes and rethrows the first watcher error", () => {
    const scheduler = createEffectScheduler(EffectSchedulerMode.Flush);
    const failure = new Error("boom");
    const first = createNode(() => {
      throw failure;
    });
    const second = createNode();

    scheduler.enqueue(first);
    scheduler.enqueue(second);

    expect(() => scheduler.flush()).toThrow(failure);
    expect(calls).toEqual([first, second]);
    expect((first.state & Scheduled) !== 0).toBe(false);
    expect((second.state & Scheduled) !== 0).toBe(false);
    expect(scheduler.batchDepth).toBe(0);
  });

  it("ranked mode continues draining pending nodes and rethrows the first watcher error", () => {
    const scheduler = createEffectScheduler(EffectSchedulerMode.Ranked);
    const failure = new Error("ranked boom");
    const first = createNode(() => {
      throw failure;
    });
    const second = createNode();

    first.priority = 10;
    second.priority = 1;

    scheduler.enqueue(second);
    scheduler.enqueue(first);

    expect(() => scheduler.flush()).toThrow(failure);
    expect(calls).toEqual([first, second]);
    expect((first.state & Scheduled) !== 0).toBe(false);
    expect((second.state & Scheduled) !== 0).toBe(false);
    expect(scheduler.batchDepth).toBe(0);
  });
});
