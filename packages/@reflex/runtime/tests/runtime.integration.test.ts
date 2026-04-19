import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPropagationDepth,
  readProducer,
  runWatcher,
  writeProducer,
} from "../src";
import { createProducer, createWatcher, resetRuntime } from "./runtime.test_utils";

describe("Reactive runtime - integration safety", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it("restores propagation bookkeeping before rethrowing invalidation hook errors", () => {
    const settled = vi.fn();
    const failure = new Error("watcher failed");

    resetRuntime({
      onSinkInvalidated() {
        throw failure;
      },
      onReactiveSettled: settled,
    });

    const source = createProducer(1);
    const watcher = createWatcher(() => {
      readProducer(source);
    });

    runWatcher(watcher);
    settled.mockClear();

    expect(() => writeProducer(source, 2)).toThrow(failure);
    expect(getPropagationDepth()).toBe(0);
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it("can continue propagating after a previous invalidation error", () => {
    const settled = vi.fn();
    const failures: string[] = [];
    let shouldThrow = true;

    resetRuntime({
      onSinkInvalidated() {
        if (shouldThrow) {
          failures.push("thrown");
          throw new Error("boom");
        }
      },
      onReactiveSettled: settled,
    });

    const source = createProducer(1);
    const watcher = createWatcher(() => {
      readProducer(source);
    });

    runWatcher(watcher);

    expect(() => writeProducer(source, 2)).toThrow("boom");
    expect(getPropagationDepth()).toBe(0);

    shouldThrow = false;
    writeProducer(source, 3);

    expect(failures).toEqual(["thrown"]);
    expect(getPropagationDepth()).toBe(0);
    expect(settled).toHaveBeenCalledTimes(2);
  });
});
