import { beforeEach, describe, expect, it } from "vitest";
import { readConsumer, writeProducer } from "../../runtime.test_utils";
import { subtle } from "../../../src/debug";
import {
  expectGraph,
  expectRuntime,
  expectTrace,
  scenario,
  createTraceHarness,
  resetRuntime,
} from "../../runtime.test_utils";

/** Covers reusable scenario builders that other suites depend on. */
describe("Reactive runtime - reusable scenario coverage", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it("expresses diamond graph behavior without rebuilding graph mechanics", () => {
    const g = scenario.diamond({
      source: 1,
      shared: (s) => s * 2,
      left: (v) => v + 1,
      right: (v) => v + 2,
    });

    expect(readConsumer(g.sink)).toBe(7);
    writeProducer(g.source, 2);

    expect(readConsumer(g.sink)).toBe(11);
    expectGraph(g).toBeBidirectional();
    expectGraph(g).toHaveNoDuplicateEdges();
    expectGraph(g).toHaveSources(g.sink, [g.left, g.right]);
    expectRuntime().toBeSettled();
  });

  it.skipIf(!subtle.enabled || !__DEV__)(
    "uses trace oracle assertions for high-level debug expectations",
    () => {
      const trace = createTraceHarness();
      const g = scenario.diamond({
        source: 1,
        shared: (s) => s * 2,
        left: (v) => v + 1,
        right: (v) => v + 2,
      });

      trace.label(g.source, "source");
      trace.label(g.shared, "shared");
      trace.label(g.left, "left");
      trace.label(g.right, "right");
      trace.label(g.sink, "sink");

      expect(readConsumer(g.sink)).toBe(7);
      trace.clear();

      writeProducer(g.source, 2);
      expect(readConsumer(g.sink)).toBe(11);

      trace.expectRecomputed(["shared", "left", "right", "sink"]);
      trace.expectTracked([
        "source->shared",
        "shared->left",
        "shared->right",
        "left->sink",
        "right->sink",
      ]);
      trace.expectNoStaleCleanup();

      expectTrace(trace).toHaveSingleRecompute("shared");
    },
  );
});



