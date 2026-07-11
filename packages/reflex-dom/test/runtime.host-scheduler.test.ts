import { describe, expect, it, vi } from "vitest";
import {
  createProducer,
  createWatcher,
  readProducer,
  runWatcher,
  writeProducer,
} from "@volynets/reflex-runtime";
import { createRendererRuntime } from "../src/runtime/options";

describe("DOM host reactive scheduler", () => {
  it("deduplicates watchers and flushes after the outer batch", () => {
    const renderFlush = vi.fn();
    const runtime = createRendererRuntime({}, {
      schedule: () => () => {},
      flush: renderFlush,
    });
    const source = runtime.run(() => createProducer(0));
    const values: number[] = [];
    const watcher = runtime.run(() =>
      createWatcher(() => values.push(readProducer(source))),
    );
    runtime.run(() => runWatcher(watcher));

    runtime.batch(() => {
      runtime.batch(() => writeProducer(source, 1));
      writeProducer(source, 2);
      expect(values).toEqual([0]);
    });

    expect(values).toEqual([0, 2]);
    expect(renderFlush).toHaveBeenCalledTimes(1);
  });

  it("implements flush policy in the host with a microtask", async () => {
    const runtime = createRendererRuntime({ effectStrategy: "flush" });
    const source = runtime.run(() => createProducer(0));
    const values: number[] = [];
    const watcher = runtime.run(() =>
      createWatcher(() => values.push(readProducer(source))),
    );
    runtime.run(() => runWatcher(watcher));

    runtime.batch(() => writeProducer(source, 1));
    expect(values).toEqual([0]);
    await Promise.resolve();
    expect(values).toEqual([0, 1]);
  });

  it("continues draining after a watcher error and rethrows the first error", () => {
    const runtime = createRendererRuntime();
    const source = runtime.run(() => createProducer(0));
    const error = new Error("watcher failed");
    const values: number[] = [];
    const failing = runtime.run(() =>
      createWatcher(() => {
        if (readProducer(source) > 0) throw error;
      }),
    );
    const surviving = runtime.run(() =>
      createWatcher(() => values.push(readProducer(source))),
    );
    runtime.run(() => {
      runWatcher(failing);
      runWatcher(surviving);
    });

    expect(() => runtime.batch(() => writeProducer(source, 1))).toThrow(error);
    expect(values).toEqual([0, 1]);
  });
});
