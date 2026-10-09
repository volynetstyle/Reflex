import { afterEach, describe, expect, it } from "vitest";

import {
  claimWatcherSchedule,
  configureRuntimeContext,
  createConsumer,
  createProducer,
  createWatcher,
  readConsumer,
  readProducer,
  releaseWatcherSchedule,
  resetRuntimeContext,
  runWatcher,
  writeProducer,
  type WatcherNode,
} from "../../runtime.test_utils";

describe("scheduled watcher delivery ownership", () => {
  afterEach(() => resetRuntimeContext());

  it("does not redeliver Changed evidence to watchers already owned by the queue", () => {
    const width = 16;
    const queue: WatcherNode[] = [];
    let deliveryAttempts = 0;
    configureRuntimeContext({
      hooks: {
        onNodeInvalidated(node) {
          deliveryAttempts += 1;
          const watcher = node as WatcherNode;
          if (claimWatcherSchedule(watcher)) queue.push(watcher);
        },
      },
    });

    const source = createProducer(0);
    const derived = createConsumer(() => readProducer(source) + 1);
    const runs = new Array(width).fill(0);
    const watchers = Array.from({ length: width }, (_, index) =>
      createWatcher(() => {
        readConsumer(derived);
        runs[index] += 1;
      }),
    );
    watchers.forEach(runWatcher);

    writeProducer(source, 1);
    while (queue.length !== 0) {
      const watcher = queue.shift()!;
      releaseWatcherSchedule(watcher);
      runWatcher(watcher);
    }

    expect(deliveryAttempts).toBe(width);
    expect(runs).toEqual(new Array(width).fill(2));
  });

  it("still queues a watcher again for a genuinely reentrant side invalidation", () => {
    const queue: WatcherNode[] = [];
    configureRuntimeContext({
      hooks: {
        onNodeInvalidated(node) {
          const watcher = node as WatcherNode;
          if (claimWatcherSchedule(watcher)) queue.push(watcher);
        },
      },
    });

    const sharedSource = createProducer(0);
    const sideSource = createProducer(0);
    const derived = createConsumer(() => readProducer(sharedSource));
    let runs = 0;
    let writeDuringRun = false;
    const watcher = createWatcher(() => {
      readConsumer(derived);
      readProducer(sideSource);
      runs += 1;
      if (writeDuringRun) {
        writeDuringRun = false;
        writeProducer(sideSource, 1);
      }
    });
    runWatcher(watcher);

    writeDuringRun = true;
    writeProducer(sharedSource, 1);
    while (queue.length !== 0) {
      const scheduled = queue.shift()!;
      releaseWatcherSchedule(scheduled);
      runWatcher(scheduled);
    }

    expect(runs).toBe(3);
  });
});
