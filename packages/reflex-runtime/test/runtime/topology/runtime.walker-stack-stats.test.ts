import { describe, expect, it } from "vitest";
import {
  noteResumeEdgeStackUsage,
  noteShouldRecomputeStackUsage,
  readRuntimeWalkerStackStats,
  resetRuntimeWalkerStackStats,
  trimWalkerStackIfSparse,
} from "../../src/reactivity/walkers/stack.stats";

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
});


