import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Changed,
  DIRTY_STATE,
  Visited,
  Computing,
  createRuntimeContext,
  disposeNode,
  disposeWatcher,
  getActiveRuntimeContext,
  nextTrackingEpoch,
  resetRuntimeContextOptions,
  restoreContext,
  restoreRuntimeContext,
  readConsumer,
  readProducer,
  saveContext,
  saveRuntimeContext,
  runWatcher,
  setCurrentConsumer,
  setRuntimeHooks,
  setRuntimeContextOptions,
  writeProducer,
} from "../../runtime.test_utils";
import {
  createConsumer,
  createWatcher,
  createProducer,
  expectClean,
  expectNoSubscriber,
  expectNotComputing,
  expectNotReentrant,
  expectNotTracking,
  expectSources,
  expectSubscriber,
  linkEdge,
  resetRuntime,
  unlinkEdge,
} from "../../runtime.test_utils";

/** Covers disposal, explicit edge lifecycle, and state-bit characterization. */
describe("Reactive runtime - lifecycle and state characterization", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it("unlinkEdge removes a linked edge from future push invalidation", () => {
    const source = createProducer(1);
    const target = createConsumer(() => 0);

    const edge = linkEdge(source, target);

    expectSources(target, [source]);
    expectSubscriber(source, target);

    unlinkEdge(edge);

    expectSources(target, []);
    expectNoSubscriber(source, target);

    target.state &= ~DIRTY_STATE;
    writeProducer(source, 2);
    expectClean(target);
  });

  it("disposed consumers are removed from their sources and stop participating in push/pull", () => {
    const source = createProducer(1);
    const spy = vi.fn(() => readProducer(source) * 2);
    const target = createConsumer(spy);

    expect(readConsumer(target)).toBe(2);
    expectSubscriber(source, target);

    disposeNode(target);

    expectClean(target);
    expectSources(target, []);
    expectNoSubscriber(source, target);

    writeProducer(source, 2);

    expectClean(target);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  // Pending: re-enable once post-disposal read semantics are intentionally specified.

  it("eagerly detaches downstream subscribers when an intermediate consumer is disposed", () => {
    const source = createProducer(1);
    const middleSpy = vi.fn(() => readProducer(source) * 2);
    const middle = createConsumer(middleSpy);
    const sinkSpy = vi.fn(() => readConsumer(middle) + 1);
    const sink = createConsumer(sinkSpy);

    expect(readConsumer(sink)).toBe(3);
    expectSubscriber(source, middle);
    expectSubscriber(middle, sink);
    expectSources(sink, [middle]);

    disposeNode(middle);

    expectNoSubscriber(source, middle);
    expectNoSubscriber(middle, sink);
    expectSources(middle, []);
    expectSources(sink, []);

    writeProducer(source, 2);

    expectClean(sink);
    expect(middleSpy).toHaveBeenCalledTimes(1);
    expect(sinkSpy).toHaveBeenCalledTimes(1);
  });

  it("characterization: compute executes with Computing and Computing set, then clears them", () => {
    let target!: ReturnType<typeof createConsumer<number>>;
    let seenInside = 0;

    target = createConsumer(() => {
      seenInside = target.state;
      return 1;
    });

    expect(readConsumer(target)).toBe(1);
    expect(seenInside & Computing).toBeTruthy();
    expect(seenInside & Visited).toBeFalsy();
    expectNotTracking(target);
    expectNotComputing(target);
  });

  it("characterization: recompute clears a stale Visited bit before compute", () => {
    const source = createProducer(1);
    let target!: ReturnType<typeof createConsumer<number>>;
    let seenInside = 0;

    target = createConsumer(() => {
      seenInside = target.state;
      return readProducer(source) * 3;
    });

    expect(readConsumer(target)).toBe(3);

    target.state |= Visited | Changed;

    expect(readConsumer(target)).toBe(3);
    expect(seenInside & Computing).toBeTruthy();
    expectNotReentrant(target);
    expectClean(target);
  });

  it("runs watcher cleanup outside parent tracking during rerun", () => {
    const trigger = createProducer(0);
    const incidental = createProducer(0);
    const parent = createConsumer(() => 0);
    const watcher = createWatcher(() => {
      readProducer(trigger);

      return () => {
        readProducer(incidental);
      };
    });

    runWatcher(watcher);

    writeProducer(trigger, 1);
    setCurrentConsumer(parent);
    try {
      runWatcher(watcher);
    } finally {
      setCurrentConsumer(null);
    }

    expectNoSubscriber(incidental, parent);
  });

  it("runs watcher cleanup outside parent tracking during dispose", () => {
    const incidental = createProducer(0);
    const parent = createConsumer(() => 0);
    const watcher = createWatcher(() => {
      return () => {
        readProducer(incidental);
      };
    });

    runWatcher(watcher);

    setCurrentConsumer(parent);
    try {
      disposeWatcher(watcher);
    } finally {
      setCurrentConsumer(null);
    }

    expectNoSubscriber(incidental, parent);
  });

  it("configures hooks on the active runtime context", () => {
    const onSinkInvalidated = vi.fn();
    const onSettled = vi.fn();
    const onCleanup = vi.fn();

    setRuntimeHooks({
      effectCleanupRegistrar: onCleanup,
      reactiveSettledDispatcher: onSettled,
      sinkInvalidatedDispatcher: onSinkInvalidated,
    });

    const context = getActiveRuntimeContext();

    expect(context.effectCleanupHook).toBe(onCleanup);
    expect(context.reactiveSettledHook).toBe(onSettled);
    expect(context.sinkInvalidatedHook).toBe(onSinkInvalidated);
  });

  it("configures hooks and options on an explicit runtime context", () => {
    const context = createRuntimeContext();
    const onSinkInvalidated = vi.fn();
    const onSettled = vi.fn();
    const readTrackingStrategy = vi.fn();

    setRuntimeHooks(context, {
      reactiveSettledDispatcher: onSettled,
      sinkInvalidatedDispatcher: onSinkInvalidated,
    });
    setRuntimeContextOptions(context, {
      readTrackingStrategy,
    });

    expect(context.sinkInvalidatedHook).toBe(onSinkInvalidated);
    expect(context.reactiveSettledHook).toBe(onSettled);
    expect(context.readTrackingStrategy).toBe(readTrackingStrategy);
  });

  it("resets runtime context options to defaults", () => {
    const context = createRuntimeContext();
    const readTrackingStrategy = vi.fn();

    setRuntimeContextOptions(context, {
      readTrackingStrategy,
    });

    resetRuntimeContextOptions(context);

    expect(context.readTrackingStrategy).not.toBe(readTrackingStrategy);
  });

  it("saves and restores runtime context snapshots without rolling epoch back", () => {
    const context = createRuntimeContext();
    const consumer = createConsumer(() => 0);

    context.currentConsumer = consumer;
    context.trackingEpoch = 2;
    context.propagationScopeDepth = 1;

    const snapshot = saveRuntimeContext(context);

    context.currentConsumer = null;
    context.trackingEpoch = 5;
    context.propagationScopeDepth = 3;

    restoreRuntimeContext(context, snapshot);

    expect(context.currentConsumer).toBe(consumer);
    expect(context.trackingEpoch).toBe(5);
    expect(context.propagationScopeDepth).toBe(1);
  });

  it("saves and restores the active runtime context snapshot", () => {
    const context = getActiveRuntimeContext();
    const snapshot = saveContext();
    const epoch = nextTrackingEpoch();

    setCurrentConsumer(createConsumer(() => 0));

    restoreContext(snapshot);

    expect(context.currentConsumer).toBe(null);
    expect(context.trackingEpoch).toBe(epoch);
  });
});



