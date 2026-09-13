import { afterEach, describe, expect, it } from "vitest";
import {
  Changed,
  RuntimeState,
  Scheduled,
  createRuntimeContext,
  createWatcher,
  requestHostFlush,
  resetRuntimeContext,
  runtimeState,
  setPropagationScopeDepth,
  type WatcherNode,
} from "@volynets/reflex-runtime/internal";
import {
  Idle,
  EffectSchedulerMode,
  createRuntimeSchedulerBinding,
  createEagerScheduler,
  createFlushScheduler,
  createSabScheduler,
  type EffectScheduler,
} from "../src";

function enqueueChanged(scheduler: EffectScheduler, node: WatcherNode): void {
  node.state |= Changed;
  scheduler.enqueue(node);
}

afterEach(() => {
  setPropagationScopeDepth(0);
  resetRuntimeContext();
});

describe("scheduler policies", () => {
  it.each([EffectSchedulerMode.Flush, EffectSchedulerMode.SAB])(
    "does not consume another host drain request in deferred mode %s",
    (mode) => {
      const scheduler = createRuntimeSchedulerBinding(mode);
      const node = createWatcher(() => undefined);
      requestHostFlush();

      scheduler.flush();
      scheduler.batch(() => {
        node.state |= Changed;
        scheduler.onNodeInvalidated(node);
      });
      scheduler.flush();

      expect(runtimeState & RuntimeState.HostWorkPending).toBe(
        RuntimeState.HostWorkPending,
      );
      expect(node.state & Scheduled).toBe(0);
    },
  );

  it.each([EffectSchedulerMode.Eager, EffectSchedulerMode.SAB])(
    "keeps batch drains re-entrant and enqueue-only in mode %s",
    (mode) => {
      const scheduler = createRuntimeSchedulerBinding(mode);
      const order: string[] = [];
      const second = createWatcher(() => order.push("second"));
      const first = createWatcher(() => {
        order.push("first");
        scheduler.batch(() => {
          second.state |= Changed;
          scheduler.onNodeInvalidated(second);
          scheduler.flush();
          expect(order).toEqual(["first"]);
        });
      });

      scheduler.batch(() => {
        scheduler.batch(() => {
          first.state |= Changed;
          scheduler.onNodeInvalidated(first);
          scheduler.onNodeInvalidated(first);
          expect(order).toEqual([]);
        });
        expect(order).toEqual([]);
      });

      expect(order).toEqual(["first", "second"]);
      expect(scheduler.core.phase).toBe(Idle);
      expect(scheduler.core.batchDepth).toBe(0);
      expect(scheduler.hasPending()).toBe(false);
      expect(runtimeState & RuntimeState.HostWorkPending).toBe(0);
    },
  );

  it("releases eager host work even when a batch drain throws", () => {
    const scheduler = createRuntimeSchedulerBinding(EffectSchedulerMode.Eager);
    const failure = new Error("watcher failed");
    const node = createWatcher(() => {
      throw failure;
    });
    node.state |= Changed;
    scheduler.onNodeInvalidated(node);

    expect(() => scheduler.batch(() => undefined)).toThrow(failure);
    expect(runtimeState & RuntimeState.HostWorkPending).toBe(0);
    expect(scheduler.core.phase).toBe(Idle);
    expect(scheduler.core.batchDepth).toBe(0);
    expect(node.state & Scheduled).toBe(0);
  });

  it("clears a requested host drain after an explicit flush", () => {
    const scheduler = createRuntimeSchedulerBinding(EffectSchedulerMode.Eager);
    const node = createWatcher(() => undefined);

    node.state |= Changed;
    scheduler.onNodeInvalidated(node);
    expect(runtimeState & RuntimeState.HostWorkPending).toBe(
      RuntimeState.HostWorkPending,
    );

    scheduler.flush();
    expect(runtimeState & RuntimeState.HostWorkPending).toBe(0);
  });

  it("evaluates SAB settling against its bound runtime context", () => {
    const context = createRuntimeContext();
    context.propagationScopeDepth = 1;
    const scheduler = createRuntimeSchedulerBinding(
      EffectSchedulerMode.SAB,
      context,
    );
    let runs = 0;
    const node = createWatcher(() => ++runs);

    scheduler.batch(() => {
      node.state |= Changed;
      scheduler.onNodeInvalidated(node);
    });

    expect(runs).toBe(0);
    context.propagationScopeDepth = 0;
    scheduler.batch(() => undefined);
    expect(runs).toBe(1);
  });

  it("keeps flush-policy work deferred across a batch", () => {
    const scheduler = createFlushScheduler();
    let runs = 0;
    const node = createWatcher(() => ++runs);

    scheduler.batch(() => enqueueChanged(scheduler, node));

    expect(runs).toBe(0);
    expect(node.state & Scheduled).toBe(Scheduled);
    scheduler.flush();
    expect(runs).toBe(1);
  });

  it("runs eager work immediately while the runtime is idle", () => {
    const scheduler = createEagerScheduler();
    let runs = 0;
    const node = createWatcher(() => ++runs);

    enqueueChanged(scheduler, node);

    expect(runs).toBe(1);
    expect(node.state & Scheduled).toBe(0);
    expect(scheduler.core.phase).toBe(Idle);
  });

  it("defers eager work during propagation and drains on settled", () => {
    const scheduler = createEagerScheduler();
    let runs = 0;
    const node = createWatcher(() => ++runs);

    setPropagationScopeDepth(1);
    enqueueChanged(scheduler, node);
    expect(runs).toBe(0);

    setPropagationScopeDepth(0);
    scheduler.notifySettled();

    expect(runs).toBe(1);
    expect(node.state & Scheduled).toBe(0);
  });

  it("does not let eager settled notifications escape a nested batch", () => {
    const scheduler = createEagerScheduler();
    let runs = 0;
    const node = createWatcher(() => ++runs);

    scheduler.batch(() => {
      scheduler.batch(() => {
        enqueueChanged(scheduler, node);
        scheduler.notifySettled();
      });
      expect(runs).toBe(0);
    });

    expect(runs).toBe(1);
  });

  it("keeps ordinary SAB enqueue deferred until explicit flush", () => {
    const scheduler = createSabScheduler();
    let runs = 0;
    const node = createWatcher(() => ++runs);

    enqueueChanged(scheduler, node);
    expect(runs).toBe(0);

    scheduler.flush();
    expect(runs).toBe(1);
  });

  it("drains SAB work only at the outer settled batch boundary", () => {
    const scheduler = createSabScheduler();
    let runs = 0;
    const node = createWatcher(() => ++runs);

    scheduler.batch(() => {
      scheduler.batch(() => enqueueChanged(scheduler, node));
      expect(runs).toBe(0);
    });

    expect(runs).toBe(1);
    expect(scheduler.core.phase).toBe(Idle);
  });

  it("keeps SAB work queued when its batch exits during propagation", () => {
    const scheduler = createSabScheduler();
    let runs = 0;
    const node = createWatcher(() => ++runs);

    setPropagationScopeDepth(1);
    scheduler.batch(() => enqueueChanged(scheduler, node));
    expect(runs).toBe(0);

    setPropagationScopeDepth(0);
    scheduler.flush();
    expect(runs).toBe(1);
  });
});
