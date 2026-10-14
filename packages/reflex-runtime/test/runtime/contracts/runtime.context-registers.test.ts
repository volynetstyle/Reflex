import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  advanceTrackingEpoch,
  configureRuntimeContext,
  createRuntimeContext,
  currentConsumer,
  enterPropagationScope,
  enterReactiveBatch,
  getActiveRuntimeContext,
  leavePropagationScope,
  leaveReactiveBatch,
  propagationScopeDepth,
  reactiveBatchDepth,
  readConsumer,
  readProducer,
  resetRuntimeContext,
  restoreRuntimeContextSnapshot,
  runWithRuntimeContext,
  setTrackingEpoch,
  snapshotRuntimeContext,
  trackingEpoch,
  writeProducer,
} from "../../runtime.test_utils";
import {
  createConsumer,
  createProducer,
  createWatcher,
  expectSources,
  resetRuntime,
  runWatcher,
} from "../../runtime.test_utils";

/**
 * Execution register bank contract.
 *
 * - Configuration changes never touch live execution registers.
 * - The tracking epoch is a single kernel-wide clock: nodes and edges are
 *   shared by every context, so switching contexts must never rewind it.
 * - Context switches restore the caller's registers on return and on throw.
 */
describe("Reactive runtime - execution register bank contract", () => {
  beforeEach(() => {
    resetRuntime();
  });

  describe("configureRuntimeContext on the active context", () => {
    it("keeps the running consumer tracked", () => {
      const source = createProducer(1);
      const context = createRuntimeContext();
      let runs = 0;

      runWithRuntimeContext(context, () => {
        const computed = createConsumer(() => {
          runs++;
          configureRuntimeContext(context, {
            hooks: { onRuntimeIdle: () => {} },
          });
          return readProducer(source) * 10;
        });

        expect(readConsumer(computed)).toBe(10);
        expectSources(computed, [source]);

        writeProducer(source, 2);

        expect(readConsumer(computed)).toBe(20);
        expect(runs).toBe(2);
      });
    });

    it("keeps the running consumer tracked through the implicit overload", () => {
      const source = createProducer(1);

      const computed = createConsumer(() => {
        configureRuntimeContext({ hooks: { onRuntimeIdle: () => {} } });
        return readProducer(source);
      });

      expect(readConsumer(computed)).toBe(1);
      expectSources(computed, [source]);

      writeProducer(source, 3);
      expect(readConsumer(computed)).toBe(3);
    });

    it("does not reset propagation and batch depth", () => {
      enterPropagationScope();
      enterReactiveBatch();

      configureRuntimeContext({ hooks: { onRuntimeIdle: () => {} } });

      expect(propagationScopeDepth).toBe(1);
      expect(reactiveBatchDepth).toBe(1);

      leaveReactiveBatch();
      leavePropagationScope();

      expect(propagationScopeDepth).toBe(0);
      expect(reactiveBatchDepth).toBe(0);
    });

    it("does not rewind the tracking epoch", () => {
      for (let i = 0; i < 5; i++) advanceTrackingEpoch();
      const epoch = trackingEpoch;

      configureRuntimeContext({ hooks: { onRuntimeIdle: () => {} } });

      expect(trackingEpoch).toBe(epoch);
    });

    it("applies new hooks immediately", () => {
      const idle = vi.fn();

      configureRuntimeContext({ hooks: { onRuntimeIdle: idle } });
      enterPropagationScope();
      leavePropagationScope();

      expect(idle).toHaveBeenCalledTimes(1);
    });
  });

  describe("tracking epoch", () => {
    it("passes 2^32 without wrapping or repeating a value", () => {
      setTrackingEpoch(0xffffffff);
      const epoch = trackingEpoch;

      expect(advanceTrackingEpoch()).toBe(epoch + 1);
      expect(trackingEpoch).toBeGreaterThan(0xffffffff);
    });

    it("never moves backwards through setTrackingEpoch", () => {
      const epoch = advanceTrackingEpoch();

      setTrackingEpoch(epoch - 1);
      setTrackingEpoch(0);

      expect(trackingEpoch).toBe(epoch);
    });

    it("is never rewound by entering a fresh context", () => {
      for (let i = 0; i < 5; i++) advanceTrackingEpoch();
      const epoch = trackingEpoch;

      runWithRuntimeContext(createRuntimeContext(), () => {
        expect(trackingEpoch).toBe(epoch);
        advanceTrackingEpoch();
      });

      expect(trackingEpoch).toBe(epoch + 1);
    });

    it("is never rewound by returning to a suspended context", () => {
      const a = createRuntimeContext();
      const b = createRuntimeContext();

      runWithRuntimeContext(a, () => {
        const before = trackingEpoch;
        runWithRuntimeContext(b, () => {
          advanceTrackingEpoch();
          advanceTrackingEpoch();
        });
        expect(trackingEpoch).toBe(before + 2);
      });
    });

    it("keeps the newer epoch when a context saved an older one", () => {
      const stale = createRuntimeContext();
      stale.trackingEpoch = trackingEpoch;
      advanceTrackingEpoch();
      advanceTrackingEpoch();
      const current = trackingEpoch;

      runWithRuntimeContext(stale, () => {
        expect(trackingEpoch).toBe(current);
      });
    });

    it("restores snapshots without rewinding the clock", () => {
      const context = getActiveRuntimeContext();
      const snapshot = snapshotRuntimeContext(context);

      advanceTrackingEpoch();
      advanceTrackingEpoch();
      const current = trackingEpoch;

      restoreRuntimeContextSnapshot(context, snapshot);

      expect(trackingEpoch).toBe(current);
    });

    it("keeps dependencies when two contexts would reach the same epoch", () => {
      // A visited prefix longer than the 32-edge scan limit, with `late` out
      // of reach of the one-hop, two-hop and last-edge shortcuts, forces the
      // membership check onto the edge-version fallback. If two contexts
      // produce the same pass epoch, the stale edge to `late` looks "already
      // read this pass", the read is dropped, and the edge is swept.
      const a = createRuntimeContext();
      const b = createRuntimeContext();
      const flip = createProducer(false);
      const prefix = Array.from({ length: 40 }, () => createProducer(0));
      const early = createProducer(1);
      const middle = [createProducer(0), createProducer(0)];
      const late = createProducer(2);
      const tail = createProducer(0);
      const computed = createConsumer(() => {
        let sum = 0;
        const swapped = readProducer(flip);
        for (const node of prefix) sum += readProducer(node);
        if (swapped) sum += readProducer(late);
        sum += readProducer(early);
        for (const node of middle) sum += readProducer(node);
        if (!swapped) sum += readProducer(late);
        return sum + readProducer(tail);
      });

      runWithRuntimeContext(a, () => {
        for (let i = 0; i < 3; i++) advanceTrackingEpoch();
        expect(readConsumer(computed)).toBe(3);
      });

      runWithRuntimeContext(b, () => {
        for (let i = 0; i < 3; i++) advanceTrackingEpoch();
        writeProducer(flip, true);
        expect(readConsumer(computed)).toBe(3);
      });

      expectSources(computed, [flip, ...prefix, late, early, ...middle, tail]);

      writeProducer(late, 10);
      expect(readConsumer(computed)).toBe(11);
    });
  });

  describe("A -> B -> A switching", () => {
    it("restores the caller registers after a nested switch", () => {
      const a = createRuntimeContext();
      const b = createRuntimeContext();

      runWithRuntimeContext(a, () => {
        enterPropagationScope();
        enterReactiveBatch();

        runWithRuntimeContext(b, () => {
          expect(propagationScopeDepth).toBe(0);
          expect(reactiveBatchDepth).toBe(0);
          expect(currentConsumer).toBe(null);
        });

        expect(propagationScopeDepth).toBe(1);
        expect(reactiveBatchDepth).toBe(1);

        leaveReactiveBatch();
        leavePropagationScope();
      });

      expect(currentConsumer).toBe(null);
    });

    it("restores the caller registers when the nested context throws", () => {
      const a = createRuntimeContext();
      const b = createRuntimeContext();
      const source = createProducer(1);
      const failing = createConsumer(() => {
        readProducer(source);
        throw new Error("boom");
      });

      runWithRuntimeContext(a, () => {
        enterReactiveBatch();

        expect(() =>
          runWithRuntimeContext(b, () => {
            enterPropagationScope();
            readConsumer(failing);
          }),
        ).toThrow("boom");

        expect(getActiveRuntimeContext()).toBe(a);
        expect(currentConsumer).toBe(null);
        expect(reactiveBatchDepth).toBe(1);
        expect(propagationScopeDepth).toBe(0);

        leaveReactiveBatch();
      });

      expect(b.currentConsumer).toBe(null);
    });

    it("keeps an outer computed tracked across a nested context", () => {
      const a = createRuntimeContext();
      const b = createRuntimeContext();
      const first = createProducer(1);
      const second = createProducer(2);
      const computed = createConsumer(() => {
        const head = readProducer(first);
        runWithRuntimeContext(b, () => {
          configureRuntimeContext(a, { hooks: {} });
        });
        return head + readProducer(second);
      });

      runWithRuntimeContext(a, () => {
        expect(readConsumer(computed)).toBe(3);
        expectSources(computed, [first, second]);

        writeProducer(second, 5);
        expect(readConsumer(computed)).toBe(6);
      });
    });
  });

  describe("configuration during execution", () => {
    it("keeps a running watcher tracked", () => {
      const source = createProducer(1);
      const seen: number[] = [];
      const invalidated: unknown[] = [];
      const watcher = createWatcher(() => {
        configureRuntimeContext({
          hooks: { onNodeInvalidated: (node) => invalidated.push(node) },
        });
        seen.push(readProducer(source));
      });

      runWatcher(watcher);
      expectSources(watcher, [source]);

      writeProducer(source, 2);
      expect(invalidated).toEqual([watcher]);

      runWatcher(watcher);
      expect(seen).toEqual([1, 2]);
    });

    it("applies a hook replaced during propagation to the rest of the walk", () => {
      const source = createProducer(0);
      const first = createWatcher(() => void readProducer(source));
      const second = createWatcher(() => void readProducer(source));
      const before: unknown[] = [];
      const after: unknown[] = [];
      const idle = vi.fn();

      runWatcher(first);
      runWatcher(second);
      configureRuntimeContext({
        hooks: {
          onNodeInvalidated(node) {
            before.push(node);
            configureRuntimeContext({
              hooks: {
                onNodeInvalidated: (next) => after.push(next),
                onRuntimeIdle: idle,
              },
            });
          },
        },
      });

      writeProducer(source, 1);

      expect(before).toHaveLength(1);
      expect(after).toHaveLength(1);
      expect(new Set([...before, ...after])).toEqual(new Set([first, second]));
      expect(propagationScopeDepth).toBe(0);
      expect(idle).toHaveBeenCalledTimes(1);
    });

    it("fires the idle hook installed mid-batch once at batch exit", () => {
      const replaced = vi.fn();
      const installed = vi.fn();
      configureRuntimeContext({ hooks: { onRuntimeIdle: replaced } });

      enterReactiveBatch();
      enterPropagationScope();
      configureRuntimeContext({ hooks: { onRuntimeIdle: installed } });
      leavePropagationScope();
      expect(installed).not.toHaveBeenCalled();
      leaveReactiveBatch();

      expect(replaced).not.toHaveBeenCalled();
      expect(installed).toHaveBeenCalledTimes(1);
      expect(reactiveBatchDepth).toBe(0);
    });
  });

  describe("snapshots across contexts", () => {
    it("restores a snapshot into an inactive context without touching live registers", () => {
      const a = createRuntimeContext();
      const b = createRuntimeContext();
      const idle = vi.fn();
      configureRuntimeContext(a, { hooks: { onRuntimeIdle: idle } });
      const snapshot = snapshotRuntimeContext(a);

      enterPropagationScope();
      advanceTrackingEpoch();
      const epoch = trackingEpoch;
      restoreRuntimeContextSnapshot(b, snapshot);

      expect(propagationScopeDepth).toBe(1);
      expect(trackingEpoch).toBe(epoch);
      expect(b.runtimeIdleHook).toBe(idle);
      leavePropagationScope();

      runWithRuntimeContext(b, () => {
        enterPropagationScope();
        leavePropagationScope();
      });
      expect(idle).toHaveBeenCalledTimes(1);
    });

    it("unwinds the active context to an enclosing checkpoint", () => {
      const snapshot = snapshotRuntimeContext();

      runWithRuntimeContext(getActiveRuntimeContext(), () => {
        enterPropagationScope();
        enterReactiveBatch();
        advanceTrackingEpoch();
        const epoch = trackingEpoch;

        restoreRuntimeContextSnapshot(getActiveRuntimeContext(), snapshot);

        expect(propagationScopeDepth).toBe(0);
        expect(reactiveBatchDepth).toBe(0);
        expect(trackingEpoch).toBe(epoch);
      });

      expect(currentConsumer).toBe(null);
    });
  });

  describe("resetRuntimeContext", () => {
    it("does not rewind the tracking epoch", () => {
      advanceTrackingEpoch();
      const epoch = advanceTrackingEpoch();

      // Nodes and edges survive a reset; a rewound clock would let their
      // stamps pose as current-pass proofs (F13).
      resetRuntimeContext();

      expect(trackingEpoch).toBe(epoch);
    });
  });
});
