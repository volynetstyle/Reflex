import { afterEach, describe, expect, it } from "vitest";
import {
  Changed,
  RuntimeState,
  Scheduled,
  createRuntimeContext,
  createWatcher,
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
