import { beforeEach, describe, expect, it } from "vitest";
import {
  RuntimePhase,
  readConsumer,
  readProducer,
  readRuntimePhase,
  runWatcher,
  writeProducer,
} from "../../../src";
import {
  enterRuntimePhase,
  leaveRuntimePhase,
  runWithReactiveBatch,
} from "../../../src/internal";
import {
  createConsumer,
  createProducer,
  createWatcher,
  resetRuntime,
} from "../../runtime.test_utils";

type RuntimeWatcher = ReturnType<typeof createWatcher>;

function createBenchmarkStyleScheduler(flushSynchronouslyFromHook = false) {
  const pendingWatchers = new Set<RuntimeWatcher>();
  let isFlushing = false;
  let isFlushScheduled = false;

  function flushWatchersFromHostBoundary(): void {
    if (isFlushing || pendingWatchers.size === 0) return;

    isFlushScheduled = false;
    isFlushing = true;
    try {
      for (const watcher of pendingWatchers) {
        pendingWatchers.delete(watcher);
        runWatcher(watcher);
      }
    } finally {
      isFlushing = false;
    }
  }

  function scheduleWatcherFlush(): void {
    if (isFlushScheduled) return;

    isFlushScheduled = true;
    if (flushSynchronouslyFromHook) {
      flushWatchersFromHostBoundary();
      return;
    }

    queueMicrotask(flushWatchersFromHostBoundary);
  }

  resetRuntime({
    sinkInvalidatedDispatcher(watcher) {
      pendingWatchers.add(watcher as RuntimeWatcher);
    },
    reactiveSettledDispatcher() {
      scheduleWatcherFlush();
    },
  });

  return {
    flush: flushWatchersFromHostBoundary,
    withBatch(fn: () => void): void {
      runWithReactiveBatch(fn);
      flushWatchersFromHostBoundary();
    },
  };
}

describe("Reactive runtime - scheduler policy validation (dev)", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it("rejects synchronous watcher execution from a runtime hook", () => {
    const source = createProducer(1);
    const watcher = createWatcher(() => {
      readProducer(source);
    });

    runWatcher(watcher);

    resetRuntime({
      sinkInvalidatedDispatcher(node) {
        runWatcher(node as typeof watcher);
      },
    });

    expect(() => writeProducer(source, 2)).toThrow(
      /REFLEX_SCHEDULER_REENTRANT_FLUSH/,
    );
    expect(readRuntimePhase().phase).toBe(RuntimePhase.Idle);
    expect(readRuntimePhase().depth).toBe(0);
  });

  it("rejects reactive reads from a runtime hook", () => {
    const source = createProducer(1);
    const watcher = createWatcher(() => {
      readProducer(source);
    });

    runWatcher(watcher);

    resetRuntime({
      sinkInvalidatedDispatcher() {
        readProducer(source);
      },
    });

    expect(() => writeProducer(source, 2)).toThrow(
      /REFLEX_SCHEDULER_REACTIVE_READ_IN_HOOK/,
    );
    expect(readRuntimePhase().phase).toBe(RuntimePhase.Idle);
    expect(readRuntimePhase().depth).toBe(0);
  });

  it("rejects nested pull walks", () => {
    const source = createProducer(1);
    const inner = createConsumer(() => readProducer(source));
    const outer = createConsumer(() => readConsumer(inner));

    expect(readConsumer(outer)).toBe(1);
    writeProducer(source, 2);

    enterRuntimePhase(RuntimePhase.Pulling);
    try {
      expect(() => readConsumer(outer)).toThrow(/REFLEX_NESTED_PULL/);
    } finally {
      leaveRuntimePhase();
    }
    expect(readRuntimePhase().phase).toBe(RuntimePhase.Idle);
    expect(readRuntimePhase().depth).toBe(0);
  });

  it("rejects nested propagation from an invalidation hook", () => {
    const outerSource = createProducer(1);
    const innerSource = createProducer(1);
    let outerWatcher!: ReturnType<typeof createWatcher>;

    outerWatcher = createWatcher(() => {
      readProducer(outerSource);
    });
    const innerWatcher = createWatcher(() => {
      readProducer(innerSource);
    });

    runWatcher(outerWatcher);
    runWatcher(innerWatcher);

    resetRuntime({
      sinkInvalidatedDispatcher(node) {
        if (node === outerWatcher) {
          writeProducer(innerSource, 2);
        }
      },
    });

    expect(() => writeProducer(outerSource, 2)).toThrow(
      /REFLEX_NESTED_PROPAGATION/,
    );
    expect(readRuntimePhase().phase).toBe(RuntimePhase.Idle);
    expect(readRuntimePhase().depth).toBe(0);
  });

  it("runs a benchmark-style queued scheduler without corrupting graph edges", () => {
    const scheduler = createBenchmarkStyleScheduler();
    const sources = [createProducer(1), createProducer(2), createProducer(3)];
    const deepA = createConsumer(
      () =>
        readProducer(sources[0]!) +
        readProducer(sources[1]!) +
        readProducer(sources[2]!),
    );
    const deepB = createConsumer(() => readConsumer(deepA) * 2);
    const deepC = createConsumer(
      () => readConsumer(deepB) + readProducer(sources[0]!),
    );
    const observed: number[] = [];
    const watcher = createWatcher(() => {
      observed.push(readConsumer(deepC));
    });

    runWatcher(watcher);
    observed.length = 0;

    for (let iteration = 0; iteration < 64; iteration++) {
      scheduler.withBatch(() => {
        writeProducer(sources[0]!, iteration + 10);
        writeProducer(sources[1]!, iteration + 20);
        writeProducer(sources[2]!, iteration + 30);
      });
    }

    expect(observed).toHaveLength(64);
    expect(observed.at(-1)).toBe((73 + 83 + 93) * 2 + 73);
    expect(readRuntimePhase().phase).toBe(RuntimePhase.Idle);
    expect(readRuntimePhase().depth).toBe(0);
  });

  it("reports scheduler reentrancy instead of late edge corruption for synchronous hook flushes", () => {
    const scheduler = createBenchmarkStyleScheduler(true);
    const source = createProducer(1);
    const derived = createConsumer(() => readProducer(source) + 1);
    const watcher = createWatcher(() => {
      readConsumer(derived);
    });

    runWatcher(watcher);

    expect(() => {
      scheduler.withBatch(() => {
        writeProducer(source, 2);
      });
    }).toThrow(/REFLEX_SCHEDULER_REENTRANT_FLUSH/);
    expect(() => {
      scheduler.withBatch(() => {
        writeProducer(source, 3);
      });
    }).not.toThrow(/Cannot read properties of undefined \(reading 'to'\)/);
    expect(readRuntimePhase().phase).toBe(RuntimePhase.Idle);
    expect(readRuntimePhase().depth).toBe(0);
  });
});
