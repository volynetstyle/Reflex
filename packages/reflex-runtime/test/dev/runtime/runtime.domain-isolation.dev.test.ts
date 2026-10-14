import { beforeEach, describe, expect, it } from "vitest";
import {
  RuntimePhase,
  configureRuntimeContext,
  createRuntimeContext,
  readConsumer,
  readProducer,
  readRuntimePhase,
  resetRuntimeContext,
  runWatcher,
  runWithRuntimeContext,
  writeProducer,
  type RuntimeContext,
} from "../../../src";
import { readActiveRuntimeHook } from "../../../src/internal";
import {
  createConsumer,
  createProducer,
  createWatcher,
  resetRuntime,
} from "../../runtime.test_utils";

/**
 * PR-02: diagnostic phase, hook and recompute state belong to the active
 * execution domain (E2). Independent domains never see each other's phases.
 */
describe("Reactive runtime - DEV diagnostic state per execution domain", () => {
  let a: RuntimeContext;
  let b: RuntimeContext;

  beforeEach(() => {
    resetRuntime();
    a = createRuntimeContext();
    b = createRuntimeContext();
  });

  function expectIdlePhase(): void {
    expect(readRuntimePhase().phase).toBe(RuntimePhase.Idle);
    expect(readRuntimePhase().depth).toBe(0);
    expect(readActiveRuntimeHook()).toBe(null);
  }

  it("lets another domain run a watcher from an invalidation hook", () => {
    const bSource = createProducer(1);
    const bSeen: number[] = [];
    const bWatcher = runWithRuntimeContext(b, () => {
      const watcher = createWatcher(
        () => void bSeen.push(readProducer(bSource)),
      );
      runWatcher(watcher);
      return watcher;
    });

    const aSource = createProducer(0);
    runWithRuntimeContext(a, () => {
      const aWatcher = createWatcher(() => void readProducer(aSource));
      runWatcher(aWatcher);
      configureRuntimeContext({
        hooks: {
          onNodeInvalidated() {
            runWithRuntimeContext(b, () => {
              expect(readActiveRuntimeHook()).toBe(null);
              writeProducer(bSource, 2);
              runWatcher(bWatcher);
            });
            expect(readActiveRuntimeHook()).toBe("onNodeInvalidated");
          },
        },
      });

      writeProducer(aSource, 1);
      expectIdlePhase();
    });

    expect(bSeen).toEqual([1, 2]);
  });

  it("lets another domain propagate while this domain propagates", () => {
    const bSource = createProducer(0);
    const bInvalidated: unknown[] = [];
    runWithRuntimeContext(b, () => {
      configureRuntimeContext({
        hooks: { onNodeInvalidated: (node) => bInvalidated.push(node) },
      });
      runWatcher(createWatcher(() => void readProducer(bSource)));
    });

    const aSource = createProducer(0);
    runWithRuntimeContext(a, () => {
      configureRuntimeContext({
        hooks: {
          onNodeInvalidated() {
            runWithRuntimeContext(b, () => {
              expect(readRuntimePhase().phase).toBe(RuntimePhase.Idle);
              writeProducer(bSource, 1);
            });
            expect(readRuntimePhase().phase).toBe(RuntimePhase.Propagating);
          },
        },
      });
      runWatcher(createWatcher(() => void readProducer(aSource)));
      writeProducer(aSource, 1);
      expectIdlePhase();
    });

    expect(bInvalidated).toHaveLength(1);
  });

  it("A pull -> B pull -> A read restores phases and values", () => {
    const aSource = createProducer(1);
    const bSource = createProducer(10);
    const bComputed = createConsumer(() => readProducer(bSource) * 2);
    let inner: number | undefined;
    const aComputed = createConsumer(() => {
      const value = readProducer(aSource);
      runWithRuntimeContext(b, () => {
        expect(readRuntimePhase().depth).toBe(0);
        const fromB = readConsumer(bComputed);
        runWithRuntimeContext(a, () => {
          expect(readRuntimePhase().phase).toBe(RuntimePhase.Recomputing);
          inner = readProducer(aSource);
        });
        expect(readRuntimePhase().depth).toBe(0);
        return fromB;
      });
      return value + 1;
    });

    runWithRuntimeContext(a, () => {
      expect(readConsumer(aComputed)).toBe(2);
      writeProducer(aSource, 5);
      expect(readConsumer(aComputed)).toBe(6);
      expectIdlePhase();
    });
    runWithRuntimeContext(b, expectIdlePhase);
    expect(inner).toBe(5);
  });

  it("balances phases when another domain throws inside a hook", () => {
    const aSource = createProducer(0);
    const failing = createConsumer((): number => {
      throw new Error("b failed");
    });
    const caught: unknown[] = [];

    runWithRuntimeContext(a, () => {
      configureRuntimeContext({
        hooks: {
          onNodeInvalidated() {
            try {
              runWithRuntimeContext(b, () => readConsumer(failing));
            } catch (error) {
              caught.push(error);
            }
          },
        },
      });
      runWatcher(createWatcher(() => void readProducer(aSource)));
      writeProducer(aSource, 1);
      expectIdlePhase();
    });

    runWithRuntimeContext(b, expectIdlePhase);
    expect(caught).toHaveLength(1);
  });

  it("runs another domain's watcher from a watcher cleanup", () => {
    const bSource = createProducer(0);
    const bRuns: number[] = [];
    const bWatcher = runWithRuntimeContext(b, () => {
      const watcher = createWatcher(
        () => void bRuns.push(readProducer(bSource)),
      );
      runWatcher(watcher);
      return watcher;
    });

    const aSource = createProducer(0);
    runWithRuntimeContext(a, () => {
      const aWatcher = createWatcher(() => {
        readProducer(aSource);
        return () => {
          runWithRuntimeContext(b, () => {
            writeProducer(bSource, bSource.payload + 1);
            runWatcher(bWatcher);
          });
        };
      });
      runWatcher(aWatcher);
      writeProducer(aSource, 1);
      runWatcher(aWatcher);
      expectIdlePhase();
    });

    expect(bRuns).toEqual([0, 1]);
  });

  it("refuses to reset a domain suspended below the active one", () => {
    runWithRuntimeContext(a, () => {
      runWithRuntimeContext(b, () => {
        expect(() => resetRuntimeContext(a)).toThrow(/suspended/);
        resetRuntimeContext(b);
      });
    });
    resetRuntimeContext(a);
  });

  it("keeps the diagnostic state of a reset domain separate", () => {
    const source = createProducer(0);
    const computed = createConsumer(() => {
      resetRuntimeContext(b);
      return readProducer(source);
    });

    runWithRuntimeContext(a, () => {
      expect(readConsumer(computed)).toBe(0);
      expectIdlePhase();
    });
  });
});
