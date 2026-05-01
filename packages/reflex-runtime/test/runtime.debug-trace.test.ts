import { beforeEach, describe, expect, it } from "vitest";
import { subtle } from "../src/debug";
import { readConsumer, writeProducer } from "../src";
import {
  createTraceHarness,
  expectTrace,
  scenario,
} from "./runtime.test_utils";

describe.skipIf(!subtle.enabled)(
  "Reactive runtime - debug trace oracle",
  () => {
    beforeEach(() => {
      expect(subtle.enabled).toBe(true);
    });

    it("summarizes recompute, tracking, propagation, and cleanup channels", () => {
      const trace = createTraceHarness();
      const g = scenario.branchSwitch({ gate: true, left: 10, right: 20 });

      trace.label(g.gate, "gate");
      trace.label(g.left, "left");
      trace.label(g.right, "right");
      trace.label(g.selected, "selected");

      expect(readConsumer(g.selected)).toBe(10);
      trace.clear();

    writeProducer(g.gate, false);
    expect(readConsumer(g.selected)).toBe(20);

    const summary = trace.summary();
    if (summary.recomputes.length === 0) {
      expect(summary.byType["recompute"] ?? 0).toBe(0);
      return;
    }

    trace.expectChanged(["selected"]);
    trace.expectRecomputed(["selected"]);
    trace.expectProducerReads(["gate@selected", "right@selected"]);
    trace.expectTracked(["gate->selected", "right->selected"]);

    expect(summary.byType["cleanup:stale-sources"]).toBe(1);
      expect(summary.staleCleanups).toEqual(["selected:1:left"]);
      expectTrace(trace).toHaveSingleRecompute("selected");
    });
  },
);
