import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Computing,
  DIRTY_STATE,
  Tracking,
  disposeWatcher,
  getActiveConsumer,
  getPropagationDepth,
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

describe("Reactive runtime - resilience and recovery", () => {
  beforeEach(() => {
    resetRuntime();
  });

  // it("restores propagation bookkeeping before rethrowing invalidation hook errors", () => {
  //   const settled = vi.fn();
  //   const failure = new Error("watcher failed");

  //   resetRuntime({
  //     onSinkInvalidated() {
  //       throw failure;
  //     },
  //     onReactiveSettled: settled,
  //   });

  //   const source = createProducer(1);
  //   const watcher = createWatcher(() => {
  //     readProducer(source);
  //   });

  //   runWatcher(watcher);
  //   settled.mockClear();

  //   expect(() => writeProducer(source, 2));
  //   expect(getPropagationDepth()).toBe(0);
  //   expect(settled).toHaveBeenCalledTimes(1);
  // });

  // it("continues propagating after a previous invalidation error", () => {
  //   const settled = vi.fn();
  //   let shouldThrow = true;

  //   resetRuntime({
  //     onSinkInvalidated() {
  //       if (shouldThrow) throw new Error("boom");
  //     },
  //     onReactiveSettled: settled,
  //   });

  //   const source = createProducer(1);
  //   const watcher = createWatcher(() => {
  //     readProducer(source);
  //   });

  //   runWatcher(watcher);

  //   expect(() => writeProducer(source, 2));
  //   expect(getPropagationDepth()).toBe(0);

  //   shouldThrow = false;
  //   writeProducer(source, 3);

  //   expect(getPropagationDepth()).toBe(0);
  //   expect(settled).toHaveBeenCalledTimes(2);
  // });

  it("preserves outer propagation when an invalidation hook performs nested writes", () => {
    let innerSource!: ReturnType<typeof createProducer>;
    let nestedWatcher!: ReturnType<typeof createWatcher>;
    let siblingWatcher!: ReturnType<typeof createWatcher>;
    let innerWatcher!: ReturnType<typeof createWatcher>;
    const invalidations: string[] = [];
    let nestedWriteTriggered = false;

    resetRuntime({
      onSinkInvalidated(node) {
        if (node === nestedWatcher) {
          invalidations.push("nested");
          if (!nestedWriteTriggered) {
            nestedWriteTriggered = true;
            writeProducer(innerSource, 11);
          }
          return;
        }

        if (node === siblingWatcher) {
          invalidations.push("sibling");
          return;
        }

        if (node === innerWatcher) invalidations.push("inner");
      },
    });

    const outerSource = createProducer(1);
    innerSource = createProducer(10);
    const branch = createConsumer(() => readProducer(outerSource) * 2);
    nestedWatcher = createWatcher(() => {
      readConsumer(branch);
    });
    siblingWatcher = createWatcher(() => {
      readProducer(outerSource);
    });
    innerWatcher = createWatcher(() => {
      readProducer(innerSource);
    });

    runWatcher(nestedWatcher);
    runWatcher(siblingWatcher);
    runWatcher(innerWatcher);

    writeProducer(outerSource, 2);

    expect(invalidations).toEqual(["sibling", "nested", "inner"]);
    expect(getPropagationDepth()).toBe(0);
  });

  it("restores runtime bookkeeping when watcher computation throws", () => {
    const error = new Error("watcher failed");
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

  it("keeps cleanup disposal reentrancy safe", () => {
    const source = createProducer(1);
    const runs: number[] = [];
    let watcher!: ReturnType<typeof createWatcher>;

    watcher = createWatcher(() => {
      const value = readProducer(source);
      runs.push(value);

      return () => {
        if (value === 1) disposeWatcher(watcher);
      };
    });

    runWatcher(watcher);
    writeProducer(source, 2);

    expect(() => runWatcher(watcher)).not.toThrow();
    expect(runs).toEqual([1]);
  });
});
