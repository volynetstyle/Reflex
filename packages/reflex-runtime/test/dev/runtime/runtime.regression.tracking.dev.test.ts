import { beforeEach, describe, expect, it } from "vitest";
import { subtle } from "../../../src/debug";
import { observeDebugContext } from "../../../debug/debug.impl";
import { defaultContext } from "../../../src/kernel/config";
import { cleanupUnvisitedSources, linkEdge } from "../../../src/kernel/shape";
import { profileRuntime } from "../../../src/profiling";
import { readConsumer, readProducer, writeProducer } from "../../../src";
import {
  createConsumer,
  createProducer,
  createTraceHarness as createHistoryHarness,
  expectNoStaleCleanup,
} from "../../runtime.test_utils";

/** Covers dev-only tracking and retracking regressions. */
describe("Reactive runtime - tracking regressions (dev)", () => {
  beforeEach(() => {
    expect(subtle.enabled).toBe(true);
  });

  it("records one tracking event when recompute reuses the first incoming edge", () => {
    const h = createHistoryHarness();
    const source = h.label(createProducer(1), "source");
    const total = h.label(createConsumer(() => readProducer(source) + 1), "total");

    expect(readConsumer(total)).toBe(2);
    h.clear();

    writeProducer(source, 2);
    expect(readConsumer(total)).toBe(3);

    const summary = h.summary();
    expect(summary.producerReads).toEqual(["source@total"]);
    expect(summary.trackReads).toEqual(["source->total"]);
    expect(summary.recomputes).toEqual(["total:changed"]);
    expectNoStaleCleanup(summary);
  });

  it("records one tracking event per dependency when recompute advances through expected-next edges", () => {
    const h = createHistoryHarness();
    const a = h.label(createProducer(1), "a");
    const b = h.label(createProducer(2), "b");
    const c = h.label(createProducer(3), "c");
    const total = h.label(
      createConsumer(() => readProducer(a) + readProducer(b) + readProducer(c)),
      "total",
    );

    expect(readConsumer(total)).toBe(6);
    h.clear();

    writeProducer(b, 20);
    expect(readConsumer(total)).toBe(24);

    const summary = h.summary();
    expect(summary.producerReads).toEqual(["a@total", "b@total", "c@total"]);
    expect(summary.trackReads).toEqual(["a->total", "b->total", "c->total"]);
    expect(summary.recomputes).toEqual(["total:changed"]);
    expectNoStaleCleanup(summary);
  });

  it("does not retrack stable wide dependencies more than once", () => {
    const h = createHistoryHarness();
    const sources = Array.from({ length: 128 }, (_, i) =>
      h.label(createProducer(i), `s${i}`),
    );
    const total = h.label(
      createConsumer(() => {
        let sum = 0;
        for (let i = 0; i < sources.length; i++) sum += readProducer(sources[i]!);
        return sum;
      }),
      "total",
    );

    expect(readConsumer(total)).toBeGreaterThan(0);
    h.clear();

    writeProducer(sources[10]!, 999);
    expect(readConsumer(total)).toBeGreaterThan(0);

    const summary = h.summary();
    expect(summary.producerReads.length).toBe(128);
    expect(summary.trackReads.length).toBe(128);
    expect(summary.recomputes.length).toBe(1);
    expectNoStaleCleanup(summary);
  });
  it("observes the incoming cut before outgoing unlink and preserves cleanup counts", () => {
    const retained = createProducer(1);
    const stale = createProducer(2);
    const target = createConsumer(() => 0);
    const keptEdge = linkEdge(retained, target);
    const removedEdge = linkEdge(stale, target);
    target.tailIn = keptEdge;
    const observations: boolean[][] = [];
    const stop = observeDebugContext(defaultContext, (event) => {
      if (event.type !== "cleanup:stale-sources") return;
      // Capture observations; listener assertion errors would be swallowed.
      observations.push([
        target.firstIn === keptEdge,
        target.lastIn === keptEdge,
        target.tailIn === keptEdge,
        keptEdge.nextIn === null,
        stale.firstOut === removedEdge,
        stale.lastOut === removedEdge,
        removedEdge.prevIn === keptEdge,
      ]);
    });
    try {
      const { counters } = profileRuntime(() => cleanupUnvisitedSources(target));
      expect(observations).toEqual([[true, true, true, true, true, true, true]]);
      expect(counters.cleanupEdgesDropped).toBe(1);
      expect(stale.firstOut).toBeNull();
      expect(stale.lastOut).toBeNull();
      expect(removedEdge.prevIn).toBeNull();
      expect(removedEdge.nextIn).toBeNull();
      expect(removedEdge.prevOut).toBeNull();
      expect(removedEdge.nextOut).toBeNull();
    } finally {
      stop();
    }
  });
});
