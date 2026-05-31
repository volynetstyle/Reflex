import { beforeEach, describe, expect, it } from "vitest";
import { subtle } from "../../../src/debug";
import { readConsumer, readProducer, writeProducer } from "../../../src";
import {
  createConsumer,
  createProducer,
  createTraceHarness as createHistoryHarness,
  expectNoWatcherActivity,
  expectTraceChanged as expectChanged,
  expectTraceProducerReads as expectProducerReads,
  expectTraceRecomputed as expectRecomputed,
  expectTraceTracked as expectTracked,
} from "../../runtime.test_utils";

/** Covers dev-only dynamic dependency and branch-dedup regressions. */
describe("Reactive runtime - branch regressions (dev)", () => {
  beforeEach(() => {
    expect(subtle.enabled).toBe(true);
  });

  it("rewires dynamic dependencies and cleans stale sources", () => {
    const h = createHistoryHarness();
    const toggle = h.label(createProducer(true), "toggle");
    const left = h.label(createProducer(10), "left");
    const right = h.label(createProducer(20), "right");
    const target = h.label(
      createConsumer(() =>
        readProducer(toggle) ? readProducer(left) : readProducer(right),
      ),
      "target",
    );

    expect(readConsumer(target)).toBe(10);
    h.clear();

    writeProducer(toggle, false);
    expect(readConsumer(target)).toBe(20);

    const summary = h.summary();
    expectChanged(summary, ["target"]);
    expectRecomputed(summary, ["target"]);
    expectProducerReads(summary, ["toggle@target", "right@target"]);
    expectTracked(summary, ["toggle->target", "right->target"]);
    expect(summary.consumerReads).toEqual(["target:lazy@#?"]);
    expect(summary.staleCleanups).toHaveLength(1);
    expect(summary.staleCleanups[0]).toMatch(/^target:1:left$/);
    expect(summary.byType["cleanup:stale-sources"]).toBe(1);
    expectNoWatcherActivity(summary);
  });

  it("dedupes repeated branch reads while alternating computed dependencies", () => {
    const h = createHistoryHarness();
    const head = h.label(createProducer(0), "head");
    const double = h.label(createConsumer(() => readProducer(head) * 2), "double");
    const inverse = h.label(createConsumer(() => -readProducer(head)), "inverse");
    const current = h.label(
      createConsumer(() => {
        let result = 0;
        for (let i = 0; i < 20; i += 1) {
          result += readProducer(head) % 2
            ? readConsumer(double)
            : readConsumer(inverse);
        }
        return result;
      }),
      "current",
    );

    expect(readConsumer(current)).toBe(0);
    h.clear();

    writeProducer(head, 1);
    expect(readConsumer(current)).toBe(40);

    let summary = h.summary();
    expect(summary.producerReads.filter((entry) => entry === "head@current")).toHaveLength(20);
    expect(summary.consumerReads.filter((entry) => entry === "double:lazy@current")).toHaveLength(20);
    expect(summary.trackReads.filter((entry) => entry === "head->current")).toHaveLength(20);
    expect(summary.trackReads.filter((entry) => entry === "double->current")).toHaveLength(20);
    expect(summary.staleCleanups).toEqual(["current:1:inverse"]);

    h.clear();

    writeProducer(head, 2);
    expect(readConsumer(current)).toBe(-40);

    summary = h.summary();
    expect(summary.producerReads.filter((entry) => entry === "head@current")).toHaveLength(20);
    expect(summary.consumerReads.filter((entry) => entry === "inverse:lazy@current")).toHaveLength(20);
    expect(summary.trackReads.filter((entry) => entry === "head->current")).toHaveLength(20);
    expect(summary.trackReads.filter((entry) => entry === "inverse->current")).toHaveLength(20);
    expect(summary.staleCleanups).toEqual(["current:1:double"]);
  });
});
