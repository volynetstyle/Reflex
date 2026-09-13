import { describe, expect, it, vi } from "vitest";
import * as pullModule from "../../../src/kernel/stages/second/pull_iterator";
import { createConsumer, createProducer } from "../../../src/protocol/create.node";
import { readConsumer } from "../../../src/protocol/read.consumer";
import { readProducer } from "../../../src/protocol/read.producer";
import { writeProducer } from "../../../src/protocol/write.producer";
import { currentConsumer } from "../../../src/kernel/state";
import { resetRuntimeContext } from "../../../src/kernel/context";
import type { ReactiveEdge } from "../../../src/kernel/shape";

const pullState = pullModule as typeof pullModule & {
  testPullStack: Array<ReactiveEdge | null>;
  testPullHigh: number;
};
import {
  noteResumeEdgeStackUsage,
  noteShouldRecomputeStackUsage,
  readRuntimeWalkerStackStats,
  resetRuntimeWalkerStackStats,
  trimWalkerStackIfSparse,
} from "../../../src/kernel/stages/stackStats";

/** Covers debug-only stack-stat counters for walker storage management. */
describe("Reactive runtime - walker stack stats", () => {
  it("trims sparse walker stacks only after the minimum capacity", () => {
    const small = Array.from({ length: 255 }, (_, index) => index);
    trimWalkerStackIfSparse(small, 1);
    expect(small).toHaveLength(255);

    const dense = Array.from({ length: 256 }, (_, index) => index);
    trimWalkerStackIfSparse(dense, 65);
    expect(dense).toHaveLength(256);

    const sparse = Array.from({ length: 256 }, (_, index) => index);
    trimWalkerStackIfSparse(sparse, 64);
    expect(sparse).toHaveLength(64);
  });

  it("reports zeroed stats for production builds", () => {
    resetRuntimeWalkerStackStats();
    noteShouldRecomputeStackUsage(7);
    noteResumeEdgeStackUsage(9);

    expect(readRuntimeWalkerStackStats(2, 32, 4, 64)).toEqual({
      shouldRecompute: { current: 0, peak: 0, capacity: 0 },
      propagate: { current: 0, peak: 0, capacity: 0 },
    });
  });
  it.each(["dependency", "bubble"] as const)(
    "releases descended pull continuations when advance throws at %s",
    (site) => {
      resetRuntimeContext();
      vi.stubGlobal("__DEV__", false);
      vi.stubGlobal("__PROFILE__", false);
      try {
        let shouldThrow = false;
        const failure = new Error("advance failed");
        const source = createProducer(1);
        const leaf = createConsumer(() => {
          const value = readProducer(source);
          if (shouldThrow && site === "dependency") throw failure;
          return value;
        });
        const middle = createConsumer(() => {
          const value = readConsumer(leaf);
          if (shouldThrow && site === "bubble") throw failure;
          return value + 1;
        });
        const upper = createConsumer(() => readConsumer(middle) + 1);
        const root = createConsumer(() => readConsumer(upper) + 1);
        expect(readConsumer(root)).toBe(4);
        const base = pullState.testPullHigh;

        for (const value of [2, 3]) {
          writeProducer(source, value);
          shouldThrow = true;
          expect(() => readConsumer(root)).toThrow(failure);
          expect.soft(pullState.testPullHigh).toBe(base);
          expect.soft(pullState.testPullStack.slice(base).every((edge) => edge == null)).toBe(true);
          expect(currentConsumer).toBeNull();

          shouldThrow = false;
          expect(readConsumer(root)).toBe(value + 3);
          expect(pullState.testPullHigh).toBe(base);
          expect(pullState.testPullStack.slice(base).every((edge) => edge == null)).toBe(true);
        }
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );

  it("preserves outer pull continuations when a nested descended pull throws", () => {
    resetRuntimeContext();
    vi.stubGlobal("__DEV__", false);
    vi.stubGlobal("__PROFILE__", false);
    try {
      let shouldThrow = false;
      const failure = new Error("nested advance failed");
      const nestedSource = createProducer(10);
      const nestedLeaf = createConsumer(() => {
        const value = readProducer(nestedSource);
        if (shouldThrow) throw failure;
        return value;
      });
      const nestedMiddle = createConsumer(() => readConsumer(nestedLeaf) + 1);
      const nestedRoot = createConsumer(() => readConsumer(nestedMiddle) + 1);
      const source = createProducer(1);
      let caught = false;
      const leaf = createConsumer(() => {
        const value = readProducer(source);
        if (shouldThrow) {
          const base = pullState.testPullHigh;
          const outer = pullState.testPullStack.slice(0, base);
          expect(base).toBeGreaterThan(0);
          expect(() => readConsumer(nestedRoot)).toThrow(failure);
          caught = true;
          expect.soft(pullState.testPullHigh).toBe(base);
          for (let index = 0; index < base; index++) {
            expect(pullState.testPullStack[index]).toBe(outer[index]);
          }
          expect.soft(pullState.testPullStack.slice(base).every((edge) => edge == null)).toBe(true);
        }
        return value;
      });
      const middle = createConsumer(() => readConsumer(leaf) + 1);
      const root = createConsumer(() => readConsumer(middle) + 1);
      expect(readConsumer(nestedRoot)).toBe(12);
      expect(readConsumer(root)).toBe(3);
      const entryBase = pullState.testPullHigh;
      writeProducer(nestedSource, 20);
      writeProducer(source, 2);
      shouldThrow = true;
      expect(readConsumer(root)).toBe(4);
      expect(caught).toBe(true);
      expect(pullState.testPullHigh).toBe(entryBase);
      expect(pullState.testPullStack.slice(entryBase).every((edge) => edge == null)).toBe(true);
      shouldThrow = false;
      expect(readConsumer(nestedRoot)).toBe(22);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
