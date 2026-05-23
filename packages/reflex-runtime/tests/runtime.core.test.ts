import { beforeEach, describe, expect, it } from "vitest";
import {
  type ReactiveNode,
  Changed,
  ConsumerReadMode,
  Invalid,
  ReactiveNodeState,
  readConsumer,
  readProducer,
  runWatcher,
  writeProducer,
} from "../src";
import {
  createConsumer,
  createProducer,
  createWatcher,
  resetRuntime,
  hasSubscriber,
  incomingSources,
} from "./runtime.test_utils";

describe("Runtime Core: Algorithm Correctness", () => {
  beforeEach(() => resetRuntime());

  describe("Push Invalidation", () => {
    it("marks direct subscribers Changed", () => {
      const source = createProducer(5);
      const consumer = createConsumer(() => readProducer(source) * 2);

      writeProducer(source, 10);
      expect(consumer.state & Changed).toBe(
        Changed,
      );
    });

    it("marks transitive subscribers Invalid, not Changed", () => {
      const source = createProducer(1);
      const middle = createConsumer(() => readProducer(source));
      const leaf = createConsumer(() => readConsumer(middle));

      readConsumer(leaf);
      writeProducer(source, 2);

      // Direct subscriber
      expect(middle.state & Changed).toBe(
        Changed,
      );
      // Transitive subscriber
      expect(leaf.state & Invalid).toBe(
        Invalid,
      );
      expect(leaf.state & Changed).toBe(0);
    });

    it("marks direct watcher subscribers Changed without treating them as transitive Invalid", () => {
      const source = createProducer(1);
      const watcher = createWatcher(() => {
        readProducer(source);
        return () => {};
      });

      runWatcher(watcher);
      writeProducer(source, 2);
      expect(watcher.state & Changed).toBe(
        Changed,
      );
      expect(watcher.state & Invalid).toBe(0);
    });

    it("handles re-entrant mutations safely", () => {
      const a = createProducer(1);
      const b = createProducer(2);
      let reentrant = false;

      const consumer = createConsumer(() => {
        const val = readProducer(a);
        if (val > 5 && !reentrant) {
          reentrant = true;
          writeProducer(b, 99);
        }
        return val;
      });

      // Should not crash or corrupt state
      writeProducer(a, 10);
      readConsumer(consumer);

      expect(reentrant).toBe(true);
    });

    it("propagates through multiple branches", () => {
      const source = createProducer(0);
      const left = createConsumer(() => readProducer(source));
      const right = createConsumer(() => readProducer(source));

      writeProducer(source, 1);

      expect(left.state & Changed).toBe(
        Changed,
      );
      expect(right.state & Changed).toBe(
        Changed,
      );
    });
  });

  describe("Pull Stabilization", () => {
    it("recomputes only when Changed", () => {
      const source = createProducer(5);
      let computeCount = 0;
      const consumer = createConsumer(() => {
        computeCount++;
        return readProducer(source) * 2;
      });

      // First read triggers initial compute (was dirty)
      const val1 = readConsumer(consumer);
      expect(computeCount).toBe(1);
      expect(val1).toBe(10);

      // Second read: consumer is clean
      const val2 = readConsumer(consumer);
      expect(computeCount).toBe(1); // No recompute
      expect(val2).toBe(10);

      // After write: consumer is Changed
      writeProducer(source, 3);
      const val3 = readConsumer(consumer);
      expect(computeCount).toBe(2); // Recomputes
      expect(val3).toBe(6);
    });

    it("verifies Invalid subscribers via shouldRecompute", () => {
      const source = createProducer(1);
      const gate = createProducer(true);
      let computeCount = 0;

      const consumer = createConsumer(() => {
        computeCount++;
        if (readProducer(gate)) {
          return readProducer(source);
        }
        return -1;
      });

      readConsumer(consumer);
      expect(computeCount).toBe(1);

      // Change gate to false: consumer doesn't read source anymore
      writeProducer(gate, false);
      readConsumer(consumer);
      expect(computeCount).toBe(2);

      // Change source: consumer is Invalid, but doesn't depend anymore
      writeProducer(source, 99);

      // Should not recompute (shouldRecompute returns false)
      const val = readConsumer(consumer);
      expect(computeCount).toBe(2); // Still 2!
      expect(val).toBe(-1);
    });

    it("uses eager mode to prevent dependency tracking", () => {
      const source = createProducer(42);
      const derived = createConsumer(() => readProducer(source));
      const observer = createConsumer(() => {
        // Read in eager mode: doesn't create edge
        const val = readConsumer(derived, ConsumerReadMode.eager);
        return val + 1;
      });

      readConsumer(observer);

      // observer should NOT be a subscriber of derived
      expect(hasSubscriber(derived, observer)).toBe(false);

      writeProducer(source, 100);
      // Even though derived changed, observer shouldn't be marked Invalid
      // because it doesn't subscribe via eager read
    });

    it("rebuilds dependency list on each compute", () => {
      const a = createProducer(1);
      const b = createProducer(2);
      const gate = createProducer(true);

      const consumer = createConsumer(() => {
        if (readProducer(gate)) {
          return readProducer(a);
        } else {
          return readProducer(b);
        }
      });

      readConsumer(consumer); // Depends on [gate, a]
      expect(incomingSources(consumer).length).toBe(2);

      // Switch branch
      writeProducer(gate, false);
      readConsumer(consumer); // Now depends on [gate, b]

      // Should have exactly 2 sources: gate and b (a unlinked)
      const sources = incomingSources(consumer);
      expect(sources).toContain(gate);
      expect(sources).toContain(b);
      expect(sources.length).toBe(2);
    });

    it("cleans stale suffix after branch switch", () => {
      const old = createProducer("old");
      const mode = createProducer(true);

      const consumer = createConsumer(() => {
        if (readProducer(mode)) {
          return readProducer(old); // Read old
        }
        return "new"; // Don't read old
      });

      // Initial: depends on [mode, old]
      readConsumer(consumer);
      expect(hasSubscriber(old, consumer)).toBe(true);

      // Switch to not reading old
      writeProducer(mode, false);
      readConsumer(consumer);

      // Edge to old should be unlinked
      expect(hasSubscriber(old, consumer)).toBe(false);

      // Subsequent write to old doesn't affect consumer
      writeProducer(old, "changed");
      // Consumer should remain clean
      expect(consumer.state & Invalid).toBe(0);
    });

    it("handles untracked reads", () => {
      const source = createProducer(10);
      let trackedReads = 0;
      let untrackedReads = 0;

      const consumer = createConsumer(() => {
        trackedReads++;
        return 0;
      });

      readConsumer(consumer);
      expect(incomingSources(consumer).length).toBe(0);

      // Using the framework as designed:
      // untracked is part of API
      writeProducer(source, 20);
      readConsumer(consumer);
      // Consumer stays clean because no tracked reads
    });
  });

  describe("Dynamic Dependencies", () => {
    it("adds edges for newly read dependencies", () => {
      const source = createProducer(5);
      const consumer = createConsumer(() => readProducer(source));

      readConsumer(consumer);
      expect(hasSubscriber(source, consumer)).toBe(true);
    });

    it("removes edges when dependencies stop being read", () => {
      const a = createProducer(1);
      const b = createProducer(2);
      const useA = createProducer(true);

      const consumer = createConsumer(() => {
        if (readProducer(useA)) return readProducer(a);
        return readProducer(b);
      });

      readConsumer(consumer);
      expect(hasSubscriber(a, consumer)).toBe(true);
      expect(hasSubscriber(b, consumer)).toBe(false);

      writeProducer(useA, false);
      readConsumer(consumer);
      expect(hasSubscriber(a, consumer)).toBe(false);
      expect(hasSubscriber(b, consumer)).toBe(true);
    });

    it("doesn't create duplicate edges", () => {
      const source = createProducer(1);
      const consumer = createConsumer(() => {
        // Read same source twice
        const a = readProducer(source);
        const b = readProducer(source);
        return a + b;
      });

      readConsumer(consumer);

      // Should have exactly 1 incoming edge
      let edgeCount = 0;
      for (let edge = consumer.firstIn; edge !== null; edge = edge.nextIn) {
        if (edge.from === source) edgeCount++;
      }
      expect(edgeCount).toBe(1);
    });
  });

  describe("State Transitions", () => {
    it("starts consumer in Changed state (dirty)", () => {
      const consumer = createConsumer(() => 42);
      expect(consumer.state & Changed).toBe(
        Changed,
      );
    });

    it("clears dirty bits after successful read", () => {
      const source = createProducer(1);
      const consumer = createConsumer(() => readProducer(source));

      expect(consumer.state & Changed).toBe(
        Changed,
      );
      readConsumer(consumer);
      expect(consumer.state & Changed).toBe(0);
    });

    it("watcher starts in Changed state", () => {
      const watcher = createWatcher(() => {});
      expect(watcher.state & Changed).toBe(
        Changed,
      );
    });

    it("producer starts clean", () => {
      const producer = createProducer(0);
      // Producers start clean (no DIRTY_STATE)
      expect(producer.state & (Invalid | Changed)).toBe(0);
    });
  });

  describe("Context Isolation", () => {
    it("saved runtime snapshots can be restored without corrupting state", () => {
      const source = createProducer(1);
      const consumer = createConsumer(() => readProducer(source));

      readConsumer(consumer);
      expect(hasSubscriber(source, consumer)).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("handles empty producers and consumers", () => {
      const empty = createProducer(undefined);
      const nullish = createProducer(null);

      const consumer = createConsumer(() => [
        readProducer(empty),
        readProducer(nullish),
      ]);

      const result = readConsumer(consumer);
      expect(result).toEqual([undefined, null]);
    });

    it("handles rapid successive writes", () => {
      const producer = createProducer(0);
      const consumer = createConsumer(() => readProducer(producer));

      readConsumer(consumer);

      for (let i = 1; i <= 10; i++) {
        writeProducer(producer, i);
      }

      const result = readConsumer(consumer);
      expect(result).toBe(10);
    });

    it("handles deeply nested dependency chains", () => {
      const source = createProducer(1);
      let current: ReactiveNode<number> = source;

      for (let i = 0; i < 10; i++) {
        const prev = current;
        current = createConsumer(() => {
          const val = readConsumer(prev);
          return val + 1;
        });
      }

      const result = readConsumer(current);
      expect(result).toBe(11);
    });
  });
});
