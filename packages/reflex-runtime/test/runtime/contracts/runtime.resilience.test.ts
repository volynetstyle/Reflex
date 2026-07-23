import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Computing,
  DIRTY_STATE,
  Scheduled,
  Computing,
  disposeWatcher,
  currentConsumer,
  propagationScopeDepth,
  readConsumer,
  readProducer,
  runWatcher,
  writeProducer,
} from "../../runtime.test_utils";
import {
  createConsumer,
  createProducer,
  createWatcher,
  resetRuntime,
} from "../../runtime.test_utils";

/** Covers failure recovery and bookkeeping restoration across reentrant paths. */
describe("Reactive runtime - resilience and recovery", () => {
  beforeEach(() => {
    resetRuntime();
  });

  // Pending: re-enable once invalidation-hook error semantics are finalized.

  it("preserves outer propagation when an invalidation hook performs nested writes", () => {
    let innerSource!: ReturnType<typeof createProducer>;
    let nestedWatcher!: ReturnType<typeof createWatcher>;
    let siblingWatcher!: ReturnType<typeof createWatcher>;
    let innerWatcher!: ReturnType<typeof createWatcher>;
    const invalidations: string[] = [];
    let nestedWriteTriggered = false;

    resetRuntime({
      sinkInvalidatedDispatcher(node) {
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
    expect(propagationScopeDepth).toBe(0);
  });

  it("restores runtime bookkeeping when watcher computation throws", () => {
    const error = new Error("watcher failed");
    const source = createProducer(1);
    const watcher = createWatcher(() => {
      readProducer(source);
      throw error;
    });

    expect(() => runWatcher(watcher)).toThrow(error);
    expect(currentConsumer).toBeNull();
    expect(watcher.state & Computing).toBe(0);
    expect(watcher.state & Computing).toBe(0);
    expect(watcher.state & DIRTY_STATE).toBe(0);
    expect(watcher.state & Scheduled).toBe(0);
  });

  it("allows a watcher computation to retry after a later invalidation", () => {
    const source = createProducer(0);
    let shouldThrow = false;
    const seen: number[] = [];
    const watcher = createWatcher(() => {
      const value = readProducer(source);
      if (shouldThrow) throw new Error("watcher failed");
      seen.push(value);
    });

    runWatcher(watcher);
    shouldThrow = true;
    writeProducer(source, 1);
    expect(() => runWatcher(watcher)).toThrow("watcher failed");
    expect(watcher.state & (DIRTY_STATE | Computing | Scheduled)).toBe(0);

    shouldThrow = false;
    writeProducer(source, 2);
    runWatcher(watcher);
    expect(seen).toEqual([0, 2]);
  });

  it("allows a watcher to retry after cleanup throws", () => {
    const source = createProducer(0);
    let throwCleanup = true;
    const seen: number[] = [];
    const watcher = createWatcher(() => {
      seen.push(readProducer(source));
      return () => {
        if (throwCleanup) throw new Error("cleanup failed");
      };
    });

    runWatcher(watcher);
    writeProducer(source, 1);
    expect(() => runWatcher(watcher)).toThrow("cleanup failed");
    expect(watcher.state & (DIRTY_STATE | Computing | Scheduled)).toBe(0);

    throwCleanup = false;
    writeProducer(source, 2);
    runWatcher(watcher);
    expect(seen).toEqual([0, 2]);
  });

  it("is terminal and idempotent when dispose cleanup throws", () => {
    const source = createProducer(0);
    const cleanup = vi.fn(() => {
      throw new Error("cleanup failed");
    });
    const watcher = createWatcher(() => {
      readProducer(source);
      return cleanup;
    });

    runWatcher(watcher);
    expect(() => disposeWatcher(watcher)).toThrow("cleanup failed");
    expect(watcher.compute).toBeUndefined();
    expect(watcher.firstIn).toBeNull();
    expect(watcher.state & (DIRTY_STATE | Computing | Scheduled)).toBe(0);

    expect(() => disposeWatcher(watcher)).not.toThrow();
    expect(cleanup).toHaveBeenCalledTimes(1);
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



