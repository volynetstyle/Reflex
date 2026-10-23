import { afterEach, describe, expect, it } from "vitest";

import {
  Both,
  Changed,
  claimWatcherSchedule,
  configureRuntimeContext,
  createConsumer,
  createProducer,
  createWatcher,
  readConsumer,
  readProducer,
  releaseWatcherSchedule,
  resetRuntimeContext,
  Revalidate,
  runWatcher,
  shouldRetryWatcherAfterFailure,
  Unknown,
  Visited,
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

/**
 * F17: the scheduler releases `Scheduled` before `runWatcher`, so during
 * validation only `Computing` certifies that the watcher is owned. A pull
 * proof that recomputes a node with a side edge into the validating watcher
 * must record `Changed` without handing the watcher to the host again.
 */
describe("validation epoch delivery ownership (F17)", () => {
  afterEach(() => resetRuntimeContext());

  /** Releases the claim before running, like the scheduler drain. */
  function createHost() {
    const queue: WatcherNode[] = [];
    const host = {
      deliveries: 0,
      runs: 0,
      drain(): void {
        while (queue.length !== 0) {
          const watcher = queue.shift()!;
          releaseWatcherSchedule(watcher);
          host.runs += 1;
          runWatcher(watcher);
        }
      },
      /** Drains with the scheduler's retry rule after a failed run. */
      drainWithRetry(): unknown[] {
        const errors: unknown[] = [];
        const retries: WatcherNode[] = [];
        while (queue.length !== 0) {
          const watcher = queue.shift()!;
          releaseWatcherSchedule(watcher);
          host.runs += 1;
          try {
            runWatcher(watcher);
          } catch (error) {
            errors.push(error);
            if (shouldRetryWatcherAfterFailure(watcher)) retries.push(watcher);
          }
        }
        for (const watcher of retries) {
          if (claimWatcherSchedule(watcher)) queue.push(watcher);
        }
        return errors;
      },
    };
    configureRuntimeContext({
      hooks: {
        onNodeInvalidated(node) {
          host.deliveries += 1;
          const watcher = node as WatcherNode;
          if (claimWatcherSchedule(watcher)) queue.push(watcher);
        },
      },
    });
    return host;
  }

  it("does not redeliver a watcher through a side edge of its own pull proof", () => {
    const host = createHost();
    const source = createProducer(0);
    const first = createConsumer(() => readProducer(source) + 1);
    const full = createConsumer(() => readConsumer(first) * 2);
    const seen: number[] = [];
    // Reading `full` before `first` makes the proof of `full` recompute
    // `first`, whose edge into the watcher is not the walker's owned edge.
    const watcher = createWatcher(() => {
      seen.push(readConsumer(full) + readConsumer(first));
    });
    runWatcher(watcher);

    for (let value = 1; value <= 4; value++) {
      writeProducer(source, value);
      host.drain();
    }

    expect(host.deliveries).toBe(4);
    expect(host.runs).toBe(4);
    expect(seen).toEqual([3, 6, 9, 12, 15]);
    expect(watcher.state & (Changed | Unknown | Visited | Revalidate)).toBe(0);
  });

  it("still delivers a reentrant write made during the side-edge proof", () => {
    const host = createHost();
    const source = createProducer(0);
    const side = createProducer(0);
    let writeSide = false;
    const first = createConsumer(() => {
      const value = readProducer(source) + 1;
      if (writeSide) {
        writeSide = false;
        writeProducer(side, value);
      }
      return value;
    });
    const full = createConsumer(() => readConsumer(first) * 2);
    const seen: Array<[number, number, number]> = [];
    const watcher = createWatcher(() => {
      seen.push([readConsumer(full), readConsumer(first), readProducer(side)]);
    });
    runWatcher(watcher);

    // `side` is already committed to the watcher, so the nested write during
    // validation is execution evidence that must outlive this epoch.
    writeSide = true;
    writeProducer(source, 1);
    host.drain();

    expect(seen).toEqual([
      [2, 1, 0],
      [4, 2, 2],
    ]);
    expect(host.runs).toBe(2);
    expect(watcher.state & (Changed | Unknown | Visited | Revalidate)).toBe(0);
  });

  it("keeps a watcher retryable when validation throws after a side-edge proof", () => {
    const host = createHost();
    const source = createProducer(0);
    const failing = createProducer(false);
    const first = createConsumer(() => readProducer(source) + 1);
    const full = createConsumer(() => readConsumer(first) * 2);
    const guard = createConsumer(() => {
      readProducer(source);
      if (readProducer(failing)) throw new Error("validation failed");
      return 0;
    });
    const seen: number[] = [];
    const watcher = createWatcher(() => {
      seen.push(readConsumer(full) + readConsumer(first) + readConsumer(guard));
    });
    runWatcher(watcher);

    writeProducer(failing, true);
    writeProducer(source, 1);
    const errors = host.drainWithRetry();

    // One failed validation per drain: the side-edge proof must not queue
    // the watcher into the same drain again.
    expect(errors).toHaveLength(1);
    expect(seen).toEqual([3]);
    expect(watcher.state & Both).not.toBe(0);

    // `guard` is still dirty, so push cannot reach the watcher; the retry
    // alone must execute it, using the Changed evidence of the failed pass.
    writeProducer(failing, false);
    expect(host.drainWithRetry()).toEqual([]);
    expect(seen).toEqual([3, 6]);
    expect(watcher.state & (Changed | Unknown | Visited | Revalidate)).toBe(0);
  });
});
