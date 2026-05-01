import { beforeEach, describe, expect, it } from "vitest";
import { subtle } from "../src/debug";
import {
  createTraceHarness as createHistoryHarness,
  createConsumer,
  createProducer,
  createWatcher,
  expectContainsAll,
  expectNoStaleCleanup,
  expectNoWatcherActivity,
  expectPropagationTargetsIncluded,
  expectPropagationTargetsVisitedOnce,
  expectSetEqual,
  expectTraceChanged as expectChanged,
  expectTraceProducerReads as expectProducerReads,
  expectTraceRecomputed as expectRecomputed,
  expectTraceTracked as expectTracked,
} from "./runtime.test_utils";
import { readProducer, readConsumer, writeProducer, runWatcher } from "../src";

describe("Reactive runtime - graph semantic regressions (dev)", () => {
  beforeEach(() => {
    expect(subtle.enabled).toBe(true);
  });

  it("updates a linear chain transitively", () => {
    const h = createHistoryHarness();
    const source = h.label(createProducer(1), "source");
    const c1 = h.label(
      createConsumer(() => readProducer(source) + 1),
      "c1",
    );
    const c2 = h.label(
      createConsumer(() => readConsumer(c1) + 1),
      "c2",
    );
    const c3 = h.label(
      createConsumer(() => readConsumer(c2) + 1),
      "c3",
    );

    expect(readConsumer(c3)).toBe(4);
    h.clear();

    writeProducer(source, 2);
    expect(readConsumer(c3)).toBe(5);

    const summary = h.summary();

    h.expectChanged(["c1", "c2", "c3"]);
    h.expectRecomputed(["c1", "c2", "c3"]);

    h.expectTracked(["source->c1", "c1->c2", "c2->c3"]);
    h.expectProducerReads(["source@c1"]);
    expect(summary.consumerReads).toContain("c1:lazy@c2");
    expect(summary.consumerReads).toContain("c2:lazy@c3");
    expect(summary.consumerReads).toContain("c3:lazy@#?");

    h.expectPropagationTargetsIncluded(["c1", "c2", "c3"]);
    expect(summary.byType["write:producer"]).toBe(1);
    expect(summary.byType["recompute"]).toBe(3);

    expectNoWatcherActivity(summary);
    expectNoStaleCleanup(summary);
  });

  it("updates all branches in a wide fan-out graph", () => {
    const h = createHistoryHarness();
    const source = h.label(createProducer(1), "source");
    const left = h.label(
      createConsumer(() => readProducer(source) + 1),
      "left",
    );
    const right = h.label(
      createConsumer(() => readProducer(source) + 2),
      "right",
    );
    const far = h.label(
      createConsumer(() => readProducer(source) + 3),
      "far",
    );
    const wide = h.label(
      createConsumer(() => readProducer(source) + 4),
      "wide",
    );
    const sink = h.label(
      createConsumer(
        () =>
          readConsumer(left) +
          readConsumer(right) +
          readConsumer(far) +
          readConsumer(wide),
      ),
      "sink",
    );

    expect(readConsumer(sink)).toBe(14);
    h.clear();

    writeProducer(source, 2);
    expect(readConsumer(sink)).toBe(18);

    const summary = h.summary();

    h.expectChanged(["left", "right", "far", "wide", "sink"]);
    h.expectRecomputed(["left", "right", "far", "wide", "sink"]);

    h.expectProducerReads([
      "source@left",
      "source@right",
      "source@far",
      "source@wide",
    ]);

    h.expectTracked([
      "source->left",
      "left->sink",
      "source->right",
      "right->sink",
      "source->far",
      "far->sink",
      "source->wide",
      "wide->sink",
    ]);

    expect(summary.consumerReads).toContain("left:lazy@sink");
    expect(summary.consumerReads).toContain("right:lazy@sink");
    expect(summary.consumerReads).toContain("far:lazy@sink");
    expect(summary.consumerReads).toContain("wide:lazy@sink");
    expect(summary.consumerReads).toContain("sink:lazy@#?");

    h.expectPropagationTargetsIncluded([
      "left",
      "right",
      "far",
      "wide",
      "sink",
    ]);

    expect(summary.byType["write:producer"]).toBe(1);
    expect(summary.byType["recompute"]).toBe(5);

    h.expectNoWatcherActivity();
    h.expectNoStaleCleanup();
  });

  it("reuses a shared dependency in a diamond graph without losing correctness", () => {
    const h = createHistoryHarness();
    const source = h.label(createProducer(1), "source");
    const shared = h.label(
      createConsumer(() => readProducer(source) * 2),
      "shared",
    );
    const left = h.label(
      createConsumer(() => readConsumer(shared) + 1),
      "left",
    );
    const right = h.label(
      createConsumer(() => readConsumer(shared) + 2),
      "right",
    );
    const sink = h.label(
      createConsumer(() => readConsumer(left) + readConsumer(right)),
      "sink",
    );

    expect(readConsumer(sink)).toBe(7);
    h.clear();

    writeProducer(source, 2);
    expect(readConsumer(sink)).toBe(11);

    const summary = h.summary();

    h.expectChanged(["shared", "left", "right", "sink"]);
    h.expectRecomputed(["shared", "left", "right", "sink"]);

    h.expectProducerReads(["source@shared"]);
    h.expectTracked([
      "source->shared",
      "shared->left",
      "shared->right",
      "left->sink",
      "right->sink",
    ]);

    expect(summary.consumerReads).toContain("shared:lazy@left");
    expect(summary.consumerReads).toContain("shared:lazy@right");
    expect(summary.consumerReads).toContain("left:lazy@sink");
    expect(summary.consumerReads).toContain("right:lazy@sink");
    expect(summary.consumerReads).toContain("sink:lazy@#?");

    h.expectPropagationTargetsIncluded([
      "shared",
      "left",
      "right",
      "sink",
    ]);

    expect(summary.byType["write:producer"]).toBe(1);
    expect(summary.byType["recompute"]).toBe(4);

    h.expectNoWatcherActivity();
    h.expectNoStaleCleanup();

    // Мягкая защита от явной деградации:
    // shared не должен recompute больше одного раза в одном coherent read.
    expect(
      summary.recomputes.filter((entry) => entry.startsWith("shared:")).length,
    ).toBe(1);
  });

  it("visits each node once during propagation in a diamond graph", () => {
    const h = createHistoryHarness();
    const source = h.label(createProducer(1), "source");
    const left = h.label(
      createConsumer(() => readProducer(source) + 1),
      "left",
    );
    const right = h.label(
      createConsumer(() => readProducer(source) + 2),
      "right",
    );
    const sink = h.label(
      createConsumer(() => readConsumer(left) + readConsumer(right)),
      "sink",
    );

    expect(readConsumer(sink)).toBe(5);
    h.clear();

    writeProducer(source, 2);

    const summary = h.summary();

    expect(summary.consumerReads).toEqual([]);
    expect(summary.recomputes).toEqual([]);
    expect(summary.watcherInvalidations).toEqual([]);
    expectPropagationTargetsVisitedOnce(summary, ["left", "right", "sink"]);
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

    expect(summary.staleCleanups.length).toBe(1);
    expect(summary.staleCleanups[0]).toMatch(/^target:1:left$/);

    expect(summary.byType["cleanup:stale-sources"]).toBe(1);
    expect(summary.byType["write:producer"]).toBe(1);

    expectNoWatcherActivity(summary);
  });

  it("keeps branching pull stack coherent when refresh performs a nested pull", () => {
    const h = createHistoryHarness();
    const source = h.label(createProducer(1), "source");
    const probeSource = h.label(createProducer(10), "probeSource");
    const side = h.label(createProducer(100), "side");

    const probe = h.label(
      createConsumer(() => readProducer(probeSource) * 2),
      "probe",
    );
    const left = h.label(
      createConsumer(() => readProducer(source) + readConsumer(probe)),
      "left",
    );
    const right = h.label(
      createConsumer(() => readProducer(side) + 1),
      "right",
    );
    const sink = h.label(
      createConsumer(() => readConsumer(left) + readConsumer(right)),
      "sink",
    );

    expect(readConsumer(sink)).toBe(122);
    h.clear();

    writeProducer(source, 2);
    writeProducer(probeSource, 20);

    expect(readConsumer(sink)).toBe(143);

    const summary = h.summary();

    expectChanged(summary, ["probe", "left", "sink"]);
    expectRecomputed(summary, ["probe", "left", "sink"]);
    expect(summary.consumerReads).toContain("probe:lazy@left");
    expect(summary.consumerReads).toContain("left:lazy@sink");
    expect(summary.consumerReads).toContain("sink:lazy@#?");

    h.expectNoWatcherActivity();
    h.expectNoStaleCleanup();
  });

  it("invalidates multiple effects from one source", () => {
    const h = createHistoryHarness();
    const source = h.label(createProducer(1), "source");
    const effectA = h.label(
      createWatcher(() => {
        readProducer(source);
      }),
      "effectA",
    );
    const effectB = h.label(
      createWatcher(() => {
        readProducer(source);
      }),
      "effectB",
    );
    const effectC = h.label(
      createWatcher(() => {
        readProducer(source);
      }),
      "effectC",
    );

    runWatcher(effectA);
    runWatcher(effectB);
    runWatcher(effectC);
    h.clear();

    writeProducer(source, 2);
    runWatcher(effectA);
    runWatcher(effectB);
    runWatcher(effectC);

    const summary = h.summary();

    expectSetEqual(summary.watcherInvalidations, [
      "effectA",
      "effectB",
      "effectC",
    ]);
    expectProducerReads(summary, [
      "source@effectA",
      "source@effectB",
      "source@effectC",
    ]);
    expectTracked(summary, [
      "source->effectA",
      "source->effectB",
      "source->effectC",
    ]);

    expect(summary.watcherRuns).toContain("watcher:run:start:effectA");
    expect(summary.watcherRuns).toContain("watcher:run:finish:effectA");
    expect(summary.watcherRuns).toContain("watcher:run:start:effectB");
    expect(summary.watcherRuns).toContain("watcher:run:finish:effectB");
    expect(summary.watcherRuns).toContain("watcher:run:start:effectC");
    expect(summary.watcherRuns).toContain("watcher:run:finish:effectC");

    expect(summary.recomputes).toEqual([]);
    expect(summary.consumerReads).toEqual([]);
    expectNoStaleCleanup(summary);

    expect(summary.byType["watcher:invalidated"]).toBe(3);
    expect(summary.byType["watcher:run:start"]).toBe(3);
    expect(summary.byType["watcher:run:finish"]).toBe(3);
  });

  it("coalesces multiple source writes into one computed effect observation", () => {
    const h = createHistoryHarness();
    const a = h.label(createProducer(1), "a");
    const b = h.label(createProducer(2), "b");
    const c = h.label(createProducer(3), "c");
    const sum = h.label(
      createConsumer(() => readProducer(a) + readProducer(b) + readProducer(c)),
      "sum",
    );
    const effect = h.label(
      createWatcher(() => {
        readConsumer(sum);
      }),
      "effect",
    );

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
    expect(summary.watcherRuns).toContain("watcher:run:start:effect");
    expect(summary.watcherRuns).toContain("watcher:run:finish:effect");

    expectNoStaleCleanup(summary);

    expect(summary.byType["write:producer"]).toBe(3);
    expect(summary.byType["recompute"]).toBe(1);
    expect(summary.byType["watcher:invalidated"]).toBe(1);
  });

  it("keeps many sources into one computed plus effect coherent", () => {
    const h = createHistoryHarness();

    const sources = Array.from({ length: 128 }, (_, index) =>
      h.label(createProducer(index), `source:${index}`),
    );

    const total = h.label(
      createConsumer(() => {
        let sum = 0;
        for (let i = 0; i < sources.length; ++i) {
          sum += readProducer(sources[i]!);
        }
        return sum;
      }),
      "total",
    );

    const effect = h.label(
      createWatcher(() => {
        readConsumer(total);
      }),
      "effect",
    );

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
    expect(summary.watcherRuns).toContain("watcher:run:start:effect");
    expect(summary.watcherRuns).toContain("watcher:run:finish:effect");

    const expectedProducerReads = Array.from(
      { length: 128 },
      (_, index) => `source:${index}@total`,
    );
    expectProducerReads(summary, expectedProducerReads);

    const expectedTracked = [
      ...Array.from({ length: 128 }, (_, index) => `source:${index}->total`),
      "total->effect",
    ];
    expectTracked(summary, expectedTracked);

    expectNoStaleCleanup(summary);

    expect(summary.byType["write:producer"]).toBe(4);
    expect(summary.byType["recompute"]).toBe(1);
    expect(summary.byType["watcher:invalidated"]).toBe(1);
  });

  it("keeps many sources into one direct effect coherent", () => {
    const h = createHistoryHarness();

    const sources = Array.from({ length: 128 }, (_, index) =>
      h.label(createProducer(index), `source:${index}`),
    );

    const effect = h.label(
      createWatcher(() => {
        let sum = 0;
        for (let i = 0; i < sources.length; ++i) {
          sum += readProducer(sources[i]!);
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
    expect(summary.watcherRuns).toContain("watcher:run:start:effect");
    expect(summary.watcherRuns).toContain("watcher:run:finish:effect");

    const expectedProducerReads = Array.from(
      { length: 128 },
      (_, index) => `source:${index}@effect`,
    );
    expectProducerReads(summary, expectedProducerReads);

    const expectedTracked = Array.from(
      { length: 128 },
      (_, index) => `source:${index}->effect`,
    );
    expectTracked(summary, expectedTracked);

    expectNoStaleCleanup(summary);

    expect(summary.byType["write:producer"]).toBe(4);
    expect(summary.byType["watcher:invalidated"]).toBe(1);
    expect(summary.byType["watcher:run:start"]).toBe(1);
    expect(summary.byType["watcher:run:finish"]).toBe(1);
  });

  it("records one tracking event when recompute reuses the first incoming edge", () => {
    const h = createHistoryHarness();
    const source = h.label(createProducer(1), "source");
    const total = h.label(
      createConsumer(() => readProducer(source) + 1),
      "total",
    );

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
        for (let i = 0; i < sources.length; i++) {
          sum += readProducer(sources[i]!);
        }
        return sum;
      }),
      "total",
    );

    // прогрев
    expect(readConsumer(total)).toBeGreaterThan(0);

    h.clear();

    writeProducer(sources[10]!, 999);

    expect(readConsumer(total)).toBeGreaterThan(0);

    const summary = h.summary();

    // 🔥 если тут не 128 — у тебя проблема
    expect(summary.producerReads.length).toBe(128);

    // 🔥 если больше — у тебя повторный tracking
    expect(summary.trackReads.length).toBe(128);

    // 🔥 если больше — recompute дергается лишний раз
    expect(summary.recomputes.length).toBe(1);

    expectNoStaleCleanup(summary);
  });

  it("dedupes repeated branch reads while alternating computed dependencies", () => {
    const h = createHistoryHarness();
    const head = h.label(createProducer(0), "head");
    const double = h.label(
      createConsumer(() => readProducer(head) * 2),
      "double",
    );
    const inverse = h.label(
      createConsumer(() => -readProducer(head)),
      "inverse",
    );
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

    expect(summary.producerReads.filter((entry) => entry === "head@current"))
      .toHaveLength(20);
    expect(summary.consumerReads.filter((entry) => entry === "double:lazy@current"))
      .toHaveLength(20);
    expect(summary.trackReads.filter((entry) => entry === "head->current"))
      .toHaveLength(20);
    expect(summary.trackReads.filter((entry) => entry === "double->current"))
      .toHaveLength(20);
    expect(summary.staleCleanups).toEqual(["current:1:inverse"]);

    h.clear();

    writeProducer(head, 2);
    expect(readConsumer(current)).toBe(-40);

    summary = h.summary();

    expect(summary.producerReads.filter((entry) => entry === "head@current"))
      .toHaveLength(20);
    expect(summary.consumerReads.filter((entry) => entry === "inverse:lazy@current"))
      .toHaveLength(20);
    expect(summary.trackReads.filter((entry) => entry === "head->current"))
      .toHaveLength(20);
    expect(summary.trackReads.filter((entry) => entry === "inverse->current"))
      .toHaveLength(20);
    expect(summary.staleCleanups).toEqual(["current:1:double"]);
  });
});
