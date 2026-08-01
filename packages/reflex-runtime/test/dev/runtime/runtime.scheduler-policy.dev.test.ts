import { beforeEach, describe, expect, it } from "vitest";
import {
  RuntimePhase,
  RuntimeExecutionError,
  disposeWatcher,
  readConsumer,
  readProducer,
  readRuntimePhase,
  runWatcher,
  writeProducer,
} from "../../../src";
import {
  enterReactiveBatch,
  enterRuntimePhase,
  leaveReactiveBatch,
  leaveRuntimePhase,
  readActiveRuntimeHook,
} from "../../../src/internal";
import {
  createConsumer,
  createProducer,
  createWatcher,
  resetRuntime,
} from "../../runtime.test_utils";

type RuntimeWatcher = ReturnType<typeof createWatcher>;

function runWithReactiveBatch<T>(fn: () => T): T {
  enterReactiveBatch();
  try {
    return fn();
  } finally {
    leaveReactiveBatch();
  }
}

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
    onNodeInvalidated(watcher) {
      pendingWatchers.add(watcher as RuntimeWatcher);
    },
    onRuntimeIdle() {
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
      onNodeInvalidated(node) {
        runWatcher(node as typeof watcher);
      },
    });

    expect(() => writeProducer(source, 2)).toThrow(
      RuntimeExecutionError.SchedulerReentrantFlush.code,
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
      onNodeInvalidated() {
        readProducer(source);
      },
    });

    expect(() => writeProducer(source, 2)).toThrow(
      RuntimeExecutionError.SchedulerReactiveReadInHook.code,
    );
    expect(readRuntimePhase().phase).toBe(RuntimePhase.Idle);
    expect(readRuntimePhase().depth).toBe(0);
  });

  it("rejects watcher disposal from an invalidation hook", () => {
    const source = createProducer(1);
    let watcher!: ReturnType<typeof createWatcher>;

    watcher = createWatcher(() => {
      readProducer(source);
    });
    runWatcher(watcher);

    resetRuntime({
      onNodeInvalidated(node) {
        disposeWatcher(node as typeof watcher);
      },
    });

    expect(() => writeProducer(source, 2)).toThrow(
      RuntimeExecutionError.SchedulerTopologyMutationInHook.code,
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
      onNodeInvalidated(node) {
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

  it("restores the settled hook across nested invalidation hooks", () => {
    const outerSource = createProducer(1);
    const innerSource = createProducer(1);
    const outerWatcher = createWatcher(() => readProducer(outerSource));
    const innerWatcher = createWatcher(() => readProducer(innerSource));
    const hooks: Array<string | null> = [];
    let nested = false;

    runWatcher(outerWatcher);
    runWatcher(innerWatcher);

    resetRuntime({
      onNodeInvalidated() {
        hooks.push(readActiveRuntimeHook());
      },
      onRuntimeIdle() {
        hooks.push(readActiveRuntimeHook());
        if (!nested) {
          nested = true;
          writeProducer(innerSource, 2);
        }
        hooks.push(readActiveRuntimeHook());
      },
    });

    writeProducer(outerSource, 2);

    expect(hooks).toEqual([
      "onNodeInvalidated",
      "onRuntimeIdle",
      "onNodeInvalidated",
      "onRuntimeIdle",
      "onRuntimeIdle",
      "onRuntimeIdle",
    ]);
    expect(readActiveRuntimeHook()).toBeNull();
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

  it("permits synchronous watcher flushes from the settled boundary", () => {
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
    }).not.toThrow();
    expect(() => {
      scheduler.withBatch(() => {
        writeProducer(source, 3);
      });
    }).not.toThrow();
    expect(readRuntimePhase().phase).toBe(RuntimePhase.Idle);
    expect(readRuntimePhase().depth).toBe(0);
  });
});
