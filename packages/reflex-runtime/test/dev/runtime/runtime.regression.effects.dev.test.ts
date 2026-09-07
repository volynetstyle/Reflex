import { beforeEach, describe, expect, it } from "vitest";
import { subtle } from "../../../src/debug";
import { configureRuntimeContext } from "../../../src/kernel/context";
import { readConsumer, readProducer, runWatcher, writeProducer } from "../../../src";
import {
  createConsumer,
  createProducer,
  createTraceHarness as createHistoryHarness,
  createWatcher,
  expectNoStaleCleanup,
  expectTraceChanged as expectChanged,
  expectTraceProducerReads as expectProducerReads,
  expectTraceRecomputed as expectRecomputed,
  expectTraceTracked as expectTracked,
} from "../../runtime.test_utils";

/** Covers dev-only effect scheduling and large fan-in regressions. */
describe("Reactive runtime - effect regressions (dev)", () => {
  beforeEach(() => {
    expect(subtle.enabled).toBe(true);
  });

  it("coalesces multiple source writes into one computed effect observation", () => {
    const h = createHistoryHarness();
    // Transitive watcher notification is gated by an installed host hook.
    configureRuntimeContext({ hooks: { onNodeInvalidated() {} } });
    const a = h.label(createProducer(1), "a");
    const b = h.label(createProducer(2), "b");
    const c = h.label(createProducer(3), "c");
    const sum = h.label(
      createConsumer(() => readProducer(a) + readProducer(b) + readProducer(c)),
      "sum",
    );
    const effect = h.label(createWatcher(() => { readConsumer(sum); }), "effect");

    runWatcher(effect);
    h.clear();

    writeProducer(a, 10);
    writeProducer(b, 20);
    writeProducer(c, 30);
    runWatcher(effect);

    const summary = h.summary();
    expectChanged(summary, ["sum"]);
    expectRecomputed(summary, ["sum"]);
    expectProducerReads(summary, ["a@sum", "b@sum", "c@sum"]);
    expectTracked(summary, ["a->sum", "b->sum", "c->sum", "sum->effect"]);
    expect(summary.consumerReads).toContain("sum:lazy@effect");
    expect(summary.watcherInvalidations).toEqual(["effect"]);
    expectNoStaleCleanup(summary);
    expect(summary.byType["recompute"]).toBe(1);
  });

  it("keeps many sources into one computed plus effect coherent", () => {
    const h = createHistoryHarness();
    // Transitive watcher notification is gated by an installed host hook.
    configureRuntimeContext({ hooks: { onNodeInvalidated() {} } });
    const sources = Array.from({ length: 128 }, (_, index) =>
      h.label(createProducer(index), `source:${index}`),
    );
    const total = h.label(
      createConsumer(() => {
        let sum = 0;
        for (let i = 0; i < sources.length; ++i) sum += readProducer(sources[i]!);
        return sum;
      }),
      "total",
    );
    const effect = h.label(createWatcher(() => { readConsumer(total); }), "effect");

    runWatcher(effect);
    h.clear();

    writeProducer(sources[3]!, 1_003);
    writeProducer(sources[17]!, 2_017);
    writeProducer(sources[63]!, 3_063);
    writeProducer(sources[127]!, 4_127);
    runWatcher(effect);

    const summary = h.summary();
    expectChanged(summary, ["total"]);
    expectRecomputed(summary, ["total"]);
    expect(
      summary.recomputes.filter((entry) => entry.startsWith("total:")).length,
    ).toBe(1);
    expect(summary.consumerReads).toContain("total:lazy@effect");
    expect(summary.watcherInvalidations).toEqual(["effect"]);
    expectTracked(summary, [
      ...Array.from({ length: 128 }, (_, index) => `source:${index}->total`),
      "total->effect",
    ]);
    expectNoStaleCleanup(summary);
  });

  it("keeps many sources into one direct effect coherent", () => {
    const h = createHistoryHarness();
    // Transitive watcher notification is gated by an installed host hook.
    configureRuntimeContext({ hooks: { onNodeInvalidated() {} } });
    const sources = Array.from({ length: 128 }, (_, index) =>
      h.label(createProducer(index), `source:${index}`),
    );
    const effect = h.label(
      createWatcher(() => {
        for (let i = 0; i < sources.length; ++i) {
          readProducer(sources[i]!);
        }
      }),
      "effect",
    );

    runWatcher(effect);
    h.clear();

    writeProducer(sources[5]!, 1_005);
    writeProducer(sources[33]!, 2_033);
    writeProducer(sources[95]!, 3_095);
    writeProducer(sources[111]!, 4_111);
    runWatcher(effect);

    const summary = h.summary();
    expect(summary.recomputes).toEqual([]);
    expect(summary.consumerReads).toEqual([]);
    expect(summary.watcherInvalidations).toEqual(["effect"]);
    expectTracked(
      summary,
      Array.from({ length: 128 }, (_, index) => `source:${index}->effect`),
    );
    expectNoStaleCleanup(summary);
  });
});
