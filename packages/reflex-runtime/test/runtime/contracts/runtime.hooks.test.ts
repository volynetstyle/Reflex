import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DIRTY_STATE,
  disposeWatcher,
  propagationScopeDepth,
  readPropagateStackStats,
  emitSettledIfIdle,
  configureRuntimeContext,
  enterReactiveBatch,
  readConsumer,
  readProducer,
  leaveReactiveBatch,
  runWatcher,
  requestHostFlush,
  writeProducer,
} from "../../../src/internal";
import {
  createConsumer,
  createProducer,
  createWatcher,
  resetRuntime,
} from "../../runtime.test_utils";

/** Covers runtime hook replacement, scheduling, and cleanup semantics. */
describe("Reactive runtime - hooks and resilience", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it("replaces settled hooks instead of retaining stale callbacks", () => {
    const settled = vi.fn();

    resetRuntime({ onRuntimeIdle: settled });
    emitSettledIfIdle();

    expect(settled).toHaveBeenCalledTimes(1);

    resetRuntime();
    emitSettledIfIdle();

    expect(settled).toHaveBeenCalledTimes(1);
  });

  it("runs the host flush hook only after work is requested", () => {
    const events: string[] = [];

    configureRuntimeContext({
      hooks: {
        onRuntimeIdle() {
          events.push("idle");
        },
      },
      scheduler: {
        onHostFlush() {
          events.push("flush");
        },
      },
    });

    emitSettledIfIdle();
    expect(events).toEqual(["idle"]);

    requestHostFlush();
    emitSettledIfIdle();
    expect(events).toEqual(["idle", "flush", "idle"]);

    emitSettledIfIdle();
    expect(events).toEqual(["idle", "flush", "idle", "idle"]);
  });

  it("defers requested host work to the outer batch boundary", () => {
    const flush = vi.fn();

    configureRuntimeContext({
      scheduler: { onHostFlush: flush },
    });

    enterReactiveBatch();
    requestHostFlush();
    emitSettledIfIdle();

    expect(flush).not.toHaveBeenCalled();

    leaveReactiveBatch();
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("does not fire settled for plain recomputes without propagation", () => {
    const phases: string[] = [];

    resetRuntime({
      onRuntimeIdle() {
        phases.push("settled");
      },
    });

    const source = createProducer(2);
    const inner = createConsumer(() => {
      phases.push("inner");
      return readProducer(source) * 2;
    });
    const outer = createConsumer(() => {
      phases.push("outer:start");
      const value = readConsumer(inner);
      phases.push("outer:end");
      return value + 1;
    });

    expect(readConsumer(outer)).toBe(5);
    expect(phases).toEqual(["outer:start", "inner", "outer:end"]);
  });

  it("settles after leaf-only producer fanout propagation", () => {
    const settled = vi.fn();

    resetRuntime({ onRuntimeIdle: settled });

    const source = createProducer(1);
    const left = createConsumer(() => readProducer(source) + 1);
    const right = createConsumer(() => readProducer(source) + 2);

    expect(readConsumer(left)).toBe(2);
    expect(readConsumer(right)).toBe(3);
    settled.mockClear();

    writeProducer(source, 2);

    expect(propagationScopeDepth).toBe(0);
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it("settles once after nested propagation triggered from an invalidation hook", () => {
    const settled = vi.fn();
    let outerWatcher!: ReturnType<typeof createWatcher>;
    let innerSource!: ReturnType<typeof createProducer>;
    let innerWatcher!: ReturnType<typeof createWatcher>;

    resetRuntime({
      onNodeInvalidated(node) {
        if (node === outerWatcher) {
          writeProducer(innerSource, 2);
        }
      },
      onRuntimeIdle: settled,
    });

    const outerSource = createProducer(1);
    innerSource = createProducer(1);
    outerWatcher = createWatcher(() => {
      readProducer(outerSource);
    });
    innerWatcher = createWatcher(() => {
      readProducer(innerSource);
    });

    runWatcher(outerWatcher);
    runWatcher(innerWatcher);
    settled.mockClear();

    writeProducer(outerSource, 2);

    expect(settled).toHaveBeenCalledTimes(1);
    expect(outerWatcher.state & DIRTY_STATE).toBeTruthy();
    expect(innerWatcher.state & DIRTY_STATE).toBeTruthy();
  });

  it("unwinds propagation state when an invalidation hook throws", () => {
    const source = createProducer(1);
    const watcher = createWatcher(() => readProducer(source));
    const failure = new Error("hook failed");

    runWatcher(watcher);
    resetRuntime({
      onNodeInvalidated() {
        throw failure;
      },
    });

    expect(() => writeProducer(source, 2)).toThrow(failure);
    expect(propagationScopeDepth).toBe(0);
    expect(readPropagateStackStats().propagate.current).toBe(0);

    resetRuntime();
    runWatcher(watcher);
    expect(() => writeProducer(source, 3)).not.toThrow();
    expect(propagationScopeDepth).toBe(0);
  });

  it("delivers settled after a watcher writes while tracking", () => {
    const settled = vi.fn();
    const target = createProducer(0);
    const watcher = createWatcher(() => {
      writeProducer(target, target.payload + 1);
    });

    resetRuntime({ onRuntimeIdle: settled });
    runWatcher(watcher);

    expect(settled).toHaveBeenCalledTimes(1);
    expect(propagationScopeDepth).toBe(0);
  });

  it("delivers settled after a dirty consumer writes while tracking", () => {
    const settled = vi.fn();
    const source = createProducer(1);
    const target = createProducer(0);
    const consumer = createConsumer(() => {
      const value = readProducer(source);
      writeProducer(target, value);
      return value;
    });

    resetRuntime({ onRuntimeIdle: settled });
    expect(readConsumer(consumer)).toBe(1);
    expect(settled).toHaveBeenCalledTimes(1);

    settled.mockClear();
    writeProducer(source, 2);
    settled.mockClear();

    expect(readConsumer(consumer)).toBe(2);
    expect(settled).toHaveBeenCalledTimes(1);
  });

  // Pending: re-enable once hook-error propagation semantics are finalized.

  it("runs watcher cleanup exactly once per rerun and once on disposal", () => {
    const cleanup = vi.fn();
    const source = createProducer(1);
    const watcher = createWatcher(() => {
      readProducer(source);
      return cleanup;
    });

    runWatcher(watcher);
    writeProducer(source, 2);
    runWatcher(watcher);
    disposeWatcher(watcher);
    disposeWatcher(watcher);

    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(watcher.state & DIRTY_STATE).toBe(0);
  });
  it.each(["direct", "transitive"] as const)(
    "unwinds a %s invalidation-hook exception without rolling back the write",
    (placement) => {
      // The shared debug test barrel can set the globals at import time.
      // Exercise the production branches regardless of that side effect.
      vi.stubGlobal("__DEV__", false);
      vi.stubGlobal("__PROFILE__", false);
      try {
      const source = createProducer(1);
      const middle = createConsumer(() => readProducer(source) * 2);
      const watcher = createWatcher(() => {
        if (placement === "direct") readProducer(source);
        else readConsumer(middle);
      });
      const settled = vi.fn();
      const failure = new Error("invalidation failed");
      let shouldThrow = true;
      resetRuntime({
        onNodeInvalidated() {
          if (shouldThrow) throw failure;
        },
        onRuntimeIdle: settled,
      });
      runWatcher(watcher);
      settled.mockClear();

      const entryDepth = propagationScopeDepth;
      expect(() => writeProducer(source, 2)).toThrow(failure);
      expect(readProducer(source)).toBe(2);
      expect(propagationScopeDepth).toBe(entryDepth);
      // An aborted wave is not a completed idle notification.
      expect(settled).not.toHaveBeenCalled();

      shouldThrow = false;
      runWatcher(watcher);
      settled.mockClear();
      expect(() => writeProducer(source, 3)).not.toThrow();
      expect(propagationScopeDepth).toBe(entryDepth);
      expect(settled).toHaveBeenCalledTimes(1);
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );
  it("preserves an outer propagation scope when its hook catches a nested write failure", () => {
    vi.stubGlobal("__DEV__", false);
    vi.stubGlobal("__PROFILE__", false);
    try {
      const outerSource = createProducer(1);
      const innerSource = createProducer(1);
      const outerWatcher = createWatcher(() => { readProducer(outerSource); });
      const sibling = createWatcher(() => { readProducer(outerSource); });
      const innerWatcher = createWatcher(() => { readProducer(innerSource); });
      const failure = new Error("inner hook failed");
      const settled = vi.fn();
      const seen: string[] = [];
      resetRuntime({
        onNodeInvalidated(node) {
          if (node === innerWatcher) throw failure;
          if (node === outerWatcher) {
            const entryDepth = propagationScopeDepth;
            expect(entryDepth).toBe(1);
            expect(() => writeProducer(innerSource, 2)).toThrow(failure);
            expect(propagationScopeDepth).toBe(entryDepth);
            seen.push("outer");
          } else if (node === sibling) {
            expect(propagationScopeDepth).toBe(1);
            seen.push("sibling");
          }
        },
        onRuntimeIdle: settled,
      });
      runWatcher(outerWatcher);
      runWatcher(sibling);
      runWatcher(innerWatcher);
      settled.mockClear();
      writeProducer(outerSource, 2);
      expect(seen).toEqual(["outer", "sibling"]);
      expect(propagationScopeDepth).toBe(0);
      expect(settled).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
