import { afterEach, describe, expect, it } from "vitest";
import {
  Changed,
  Scheduled,
  createWatcher,
  resetRuntimeContext,
  setPropagationScopeDepth,
  type WatcherNode,
} from "@volynets/reflex-runtime/internal";
import {
  Idle,
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
