import { beforeEach, describe, expect, it } from "vitest";
import {
  claimWatcherSchedule,
  configureRuntimeContext,
  createProducer,
  createWatcher,
  enterReactiveBatch,
  leaveReactiveBatch,
  readProducer,
  releaseWatcherSchedule,
  requestHostFlush,
  resetRuntimeContext,
  runWatcher,
  writeProducer,
} from "../../src/internal";

describe("batch and settlement / observable reference trace", () => {
  beforeEach(resetRuntimeContext);

  it("empty and equal-write batches do not publish idle work", () => {
    const events: string[] = [];
    configureRuntimeContext({
      hooks: { onRuntimeIdle: () => events.push("idle") },
    });
    const source = createProducer(0);

    enterReactiveBatch();
    enterReactiveBatch();
    leaveReactiveBatch();
    leaveReactiveBatch();
    expect(events).toEqual([]);

    enterReactiveBatch();
    writeProducer(source, 0);
    leaveReactiveBatch();
    expect(events).toEqual([]);

    enterReactiveBatch();
    writeProducer(source, 1);
    writeProducer(source, 2);
    writeProducer(source, 2);
    expect(readProducer(source)).toBe(2); // Writes commit inside the batch.
    expect(events).toEqual([]);
    leaveReactiveBatch();
    expect(events).toEqual(["idle"]);

    writeProducer(source, 3);
    expect(events).toEqual(["idle", "idle"]);
  });

  it("deduplicates host queue work while staged writes remain visible", () => {
    const events: string[] = [];
    const observed: number[] = [];
    const source = createProducer(0);
    const watcher = createWatcher(() => {
      observed.push(readProducer(source));
    });
    runWatcher(watcher);

    configureRuntimeContext({
      hooks: {
        onNodeInvalidated(node) {
          if (node === watcher && claimWatcherSchedule(watcher)) {
            events.push("enqueue");
            requestHostFlush();
          }
        },
        onRuntimeIdle() {
          events.push("idle");
        },
      },
      scheduler: {
        onHostFlush() {
          events.push("host");
          releaseWatcherSchedule(watcher);
          runWatcher(watcher);
        },
      },
    });

    enterReactiveBatch();
    writeProducer(source, 1);
    writeProducer(source, 2);
    writeProducer(source, 2);
    expect(observed).toEqual([0]);
    expect(events).toEqual(["enqueue"]);
    leaveReactiveBatch();

    // Reference semantics: one queue entry and one observer run with the
    // latest committed value, followed by one settlement notification.
    expect(events).toEqual(["enqueue", "host", "idle"]);
    expect(observed).toEqual([0, 2]);
  });
});
