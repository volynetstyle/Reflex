import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Computing,
  DIRTY_STATE,
  Disposed,
  ReactiveNodeState,
  Tracking,
  disposeWatcher,
  getActiveConsumer,
  notifySettledIfIdle,
  readConsumer,
  readProducer,
  runWatcher,
  writeProducer,
} from "../src";
import {
  createConsumer,
  createProducer,
  createWatcher,
  resetRuntime,
} from "./runtime.test_utils";

describe("Reactive runtime - hooks and resilience", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it("replaces settled hooks instead of retaining stale callbacks", () => {
    const settled = vi.fn();

    resetRuntime({ onReactiveSettled: settled });
    notifySettledIfIdle();

    expect(settled).toHaveBeenCalledTimes(1);

    resetRuntime();
    notifySettledIfIdle();

    expect(settled).toHaveBeenCalledTimes(1);
  });

  it("does not fire settled for plain recomputes without propagation", () => {
    const phases: string[] = [];

    resetRuntime({
      onReactiveSettled() {
        phases.push("settled");
      },
    });

    const source = createProducer(2);
    const inner = createConsumer(() => {
      phases.push("inner");
      return readProducer(source) * 2;
    });
    const outer = createConsumer(() => {
      phases.push("outer:start");
      const value = readConsumer(inner);
      phases.push("outer:end");
      return value + 1;
    });

    expect(readConsumer(outer)).toBe(5);
    expect(phases).toEqual(["outer:start", "inner", "outer:end"]);
  });

  it("settles once after nested propagation triggered from an invalidation hook", () => {
    const settled = vi.fn();
    let outerWatcher!: ReturnType<typeof createWatcher>;
    let innerSource!: ReturnType<typeof createProducer>;
    let innerWatcher!: ReturnType<typeof createWatcher>;

    resetRuntime({
      onSinkInvalidated(node) {
        if (node === outerWatcher) {
          writeProducer(innerSource, 2);
        }
      },
      onReactiveSettled: settled,
    });

    const outerSource = createProducer(1);
    innerSource = createProducer(1);
    outerWatcher = createWatcher(() => {
      readProducer(outerSource);
    });
    innerWatcher = createWatcher(() => {
      readProducer(innerSource);
    });

    runWatcher(outerWatcher);
    runWatcher(innerWatcher);
    settled.mockClear();

    writeProducer(outerSource, 2);

    expect(settled).toHaveBeenCalledTimes(1);
    expect(outerWatcher.state & DIRTY_STATE).toBeTruthy();
    expect(innerWatcher.state & DIRTY_STATE).toBeTruthy();
  });

  it("fails fast on the first invalidation hook error", () => {
    const settled = vi.fn();
    const invalidated: string[] = [];
    const firstError = new Error("first watcher failure");
    let left!: ReturnType<typeof createWatcher>;
    let right!: ReturnType<typeof createWatcher>;

    resetRuntime({
      onSinkInvalidated(node) {
        if (node === left) {
          invalidated.push("left");
          throw firstError;
        }

        if (node === right) {
          invalidated.push("right");
        }
      },
      onReactiveSettled: settled,
    });

    const source = createProducer(1);
    left = createWatcher(() => {
      readProducer(source);
    });
    right = createWatcher(() => {
      readProducer(source);
    });

    runWatcher(left);
    runWatcher(right);
    settled.mockClear();

    expect(() => writeProducer(source, 2)).toThrow(firstError);
    expect(invalidated).toEqual(["left"]);
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it("restores runtime bookkeeping when watcher computation throws", () => {
    const error = new Error("watcher failed");

    resetRuntime();

    const source = createProducer(1);
    const watcher = createWatcher(() => {
      readProducer(source);
      throw error;
    });

    expect(() => runWatcher(watcher)).toThrow(error);
    expect(getActiveConsumer()).toBeNull();
    expect(watcher.state & Tracking).toBe(0);
    expect(watcher.state & Computing).toBe(0);
  });

  it("runs watcher cleanup exactly once per rerun and once on disposal", () => {
    const cleanup = vi.fn();
    const source = createProducer(1);
    const watcher = createWatcher(() => {
      readProducer(source);
      return cleanup;
    });

    runWatcher(watcher);
    writeProducer(source, 2);
    runWatcher(watcher);
    disposeWatcher(watcher);
    disposeWatcher(watcher);

    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(watcher.state & Disposed).toBeTruthy();
  });

  it("keeps watcher disposal reentrancy-safe when cleanup disposes the same watcher", () => {
    const source = createProducer(1);
    const runs: number[] = [];
    let watcher!: ReturnType<typeof createWatcher>;

    watcher = createWatcher(() => {
      const value = readProducer(source);
      runs.push(value);

      return () => {
        if (value === 1) {
          disposeWatcher(watcher);
        }
      };
    });

    runWatcher(watcher);
    writeProducer(source, 2);

    expect(() => runWatcher(watcher)).not.toThrow();
    expect(runs).toEqual([1]);
    expect(watcher.state & Disposed).toBeTruthy();
  });

  it("tolerates nodes becoming dead in the middle of propagation", () => {
    const invalidated: string[] = [];
    let left!: ReturnType<typeof createWatcher>;
    let right!: ReturnType<typeof createWatcher>;

    resetRuntime({
      onSinkInvalidated(node) {
        if (node === left) {
          invalidated.push("left");
          disposeWatcher(right);
          return;
        }

        if (node === right) {
          invalidated.push("right");
        }
      },
    });

    const source = createProducer(1);
    left = createWatcher(() => {
      readProducer(source);
    });
    right = createWatcher(() => {
      readProducer(source);
    });

    runWatcher(left);
    runWatcher(right);

    expect(() => writeProducer(source, 2)).not.toThrow();
    expect(invalidated).toEqual(["left"]);
    expect(right.state & Disposed).toBeTruthy();
  });
});
