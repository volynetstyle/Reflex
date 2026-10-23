import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activeTracking,
  claimWatcherSchedule,
  configureRuntimeContext,
  createRuntimeContext,
  disposeNodeIfUnobserved,
  enterPropagationScope,
  getActiveRuntimeContext,
  hasObservers,
  hasPendingValidation,
  invalidateWatcher,
  isContextSettled,
  isTracking,
  leavePropagationScope,
  readConsumer,
  readProducer,
  takeScheduledWatcher,
  runWithRuntimeContext,
  shouldRetryWatcherAfterFailure,
  suspendConsumerIfUnobserved,
  untracked,
  writeProducer,
} from "../../runtime.test_utils";
import {
  createConsumer,
  createProducer,
  createWatcher,
  disposeWatcher,
  resetRuntime,
  runWatcher,
} from "../../runtime.test_utils";

/**
 * Runtime integration contract (docs/RUNTIME.md#integration-contract).
 *
 * Sibling packages state an intent; the runtime answers from its registers,
 * flags and topology. These tests pin each answer to observable behavior.
 */
describe("Reactive runtime - integration contract", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it("isTracking and activeTracking follow dependency collection, not context", () => {
    const source = createProducer(1);
    const seen: boolean[] = [];
    const computed = createConsumer(() => {
      seen.push(isTracking(), activeTracking !== null);
      untracked(() => seen.push(isTracking(), activeTracking !== null));
      return readProducer(source);
    });

    expect(isTracking()).toBe(false);
    expect(activeTracking).toBeNull();
    readConsumer(computed);
    expect(seen).toEqual([true, true, false, false]);
  });

  it("isContextSettled answers for active and saved contexts", () => {
    const other = createRuntimeContext();
    expect(isContextSettled()).toBe(true);
    expect(isContextSettled(other)).toBe(true);

    const outer = getActiveRuntimeContext();
    const computed = createConsumer(() => {
      // The outer context is saved with a tracked consumer while another runs.
      runWithRuntimeContext(other, () => {
        expect(isContextSettled(outer)).toBe(false);
        expect(isContextSettled()).toBe(true);
      });
      return isContextSettled();
    });
    expect(readConsumer(computed)).toBe(false);

    enterPropagationScope();
    try {
      expect(isContextSettled()).toBe(false);
    } finally {
      leavePropagationScope();
    }
  });

  it("disposes or suspends only unobserved nodes", () => {
    const source = createProducer(1);
    let runs = 0;
    const computed = createConsumer(() => {
      runs++;
      return readProducer(source) * 2;
    });
    const watcher = createWatcher(() => {
      readConsumer(computed);
    });
    runWatcher(watcher);

    expect(hasObservers(computed)).toBe(true);
    expect(suspendConsumerIfUnobserved(computed)).toBe(false);
    expect(disposeNodeIfUnobserved(computed)).toBe(false);

    disposeWatcher(watcher);
    expect(hasObservers(computed)).toBe(false);
    expect(suspendConsumerIfUnobserved(computed)).toBe(true);
    // Suspension drops sources and cache but keeps the computation.
    expect(hasObservers(source)).toBe(false);
    expect(readConsumer(computed)).toBe(2);
    expect(runs).toBe(2);

    const lone = createProducer(0);
    expect(disposeNodeIfUnobserved(lone)).toBe(true);
  });

  it("reports pending validation and skips disposed scheduled watchers", () => {
    const source = createProducer(1);
    const watcher = createWatcher(() => {
      readProducer(source);
    });
    runWatcher(watcher);
    expect(hasPendingValidation(watcher)).toBe(false);

    writeProducer(source, 2);
    expect(hasPendingValidation(watcher)).toBe(true);
    runWatcher(watcher);
    expect(hasPendingValidation(watcher)).toBe(false);

    expect(claimWatcherSchedule(watcher)).toBe(true);
    expect(takeScheduledWatcher(watcher)).toBe(true);
    // Ownership was released: the watcher can be claimed again.
    expect(claimWatcherSchedule(watcher)).toBe(true);
    disposeWatcher(watcher);
    expect(takeScheduledWatcher(watcher)).toBe(false);
    expect(claimWatcherSchedule(watcher)).toBe(true);
  });

  it("does not request a retry after a callback failure", () => {
    const source = createProducer(0);
    const watcher = createWatcher(() => {
      if (readProducer(source) > 0) throw new Error("callback");
    });
    runWatcher(watcher);
    writeProducer(source, 1);

    expect(() => runWatcher(watcher)).toThrow("callback");
    expect(shouldRetryWatcherAfterFailure(watcher)).toBe(false);
  });

  it("invalidateWatcher forces the callback and notifies the host", () => {
    const onNodeInvalidated = vi.fn();
    const context = createRuntimeContext();
    configureRuntimeContext(context, { hooks: { onNodeInvalidated } });

    runWithRuntimeContext(context, () => {
      let runs = 0;
      const watcher = createWatcher(() => {
        runs++;
      });
      runWatcher(watcher);
      expect(runs).toBe(1);

      invalidateWatcher(watcher);
      expect(hasPendingValidation(watcher)).toBe(true);
      expect(onNodeInvalidated).toHaveBeenCalledWith(watcher);
      runWatcher(watcher);
      expect(runs).toBe(2);
    });
  });
});
