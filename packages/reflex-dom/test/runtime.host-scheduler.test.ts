import { describe, expect, it, vi } from "vitest";
import {
  createProducer,
  createWatcher,
  readProducer,
  runWatcher,
  writeProducer,
} from "@volynets/reflex-runtime";
import { createRendererRuntime } from "../src/runtime/options";
import { createMountEffects } from "../src/runtime/mount-effects";

describe("DOM host reactive scheduler", () => {
  it("deduplicates watchers and flushes after the outer batch", () => {
    const renderFlush = vi.fn();
    const runtime = createRendererRuntime(
      {},
      {
        schedule: () => () => {},
        flush: renderFlush,
      },
    );
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

  it("delivers flush-policy invalidations outside a DOM batch", async () => {
    const runtime = createRendererRuntime({ effectStrategy: "flush" });
    const source = runtime.run(() => createProducer(0));
    const values: number[] = [];
    const watcher = runtime.run(() =>
      createWatcher(() => values.push(readProducer(source))),
    );
    runtime.run(() => runWatcher(watcher));

    runtime.run(() => writeProducer(source, 1));
    expect(values).toEqual([0]);
    await Promise.resolve();
    expect(values).toEqual([0, 1]);
  });

  it("does not replay work after an explicit flush with a microtask pending", async () => {
    const runtime = createRendererRuntime({ effectStrategy: "flush" });
    const source = runtime.run(() => createProducer(0));
    const values: number[] = [];
    const watcher = runtime.run(() =>
      createWatcher(() => values.push(readProducer(source))),
    );
    runtime.run(() => runWatcher(watcher));

    runtime.batch(() => writeProducer(source, 1));
    runtime.flush();
    expect(values).toEqual([0, 1]);
    await Promise.resolve();
    expect(values).toEqual([0, 1]);
  });

  it("keeps mount effects in FIFO order through reactive feedback", () => {
    const commitQueue = createMountEffects();
    const runtime = createRendererRuntime({}, commitQueue);
    const first = runtime.run(() => createProducer(0));
    const second = runtime.run(() => createProducer(0));
    const order: string[] = [];
    const firstWatcher = runtime.run(() =>
      createWatcher(() => {
        if (readProducer(first) === 0) return;
        commitQueue.schedule(() => {
          order.push("before-1");
          writeProducer(second, 1);
        });
        commitQueue.schedule(() => order.push("render"));
      }),
    );
    const secondWatcher = runtime.run(() =>
      createWatcher(() => {
        if (readProducer(second) === 0) return;
        commitQueue.schedule(() => order.push("before-2"));
      }),
    );
    runtime.run(() => {
      runWatcher(firstWatcher);
      runWatcher(secondWatcher);
    });

    runtime.batch(() => writeProducer(first, 1));
    expect(order).toEqual(["before-1", "render", "before-2"]);
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
