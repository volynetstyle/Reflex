import { beforeEach, describe, expect, it } from "vitest";
import { subtle } from "../../../src/debug";
import { readConsumer, readProducer, runWatcher, writeProducer } from "../../../src";
import {
  createConsumer,
  createProducer,
  createTraceHarness as createHistoryHarness,
  createWatcher,
  expectNoStaleCleanup,
  expectNoWatcherActivity,
  expectPropagationTargetsIncluded,
  expectPropagationTargetsVisitedOnce,
  expectSetEqual,
  expectTraceChanged as expectChanged,
  expectTraceProducerReads as expectProducerReads,
  expectTraceRecomputed as expectRecomputed,
  expectTraceTracked as expectTracked,
} from "../../runtime.test_utils";

/** Covers dev-only graph and propagation regressions with trace assertions. */
describe("Reactive runtime - graph regressions (dev)", () => {
  beforeEach(() => {
    expect(subtle.enabled).toBe(true);
  });

  it("updates a linear chain transitively", () => {
    const h = createHistoryHarness();
    const source = h.label(createProducer(1), "source");
    const c1 = h.label(createConsumer(() => readProducer(source) + 1), "c1");
    const c2 = h.label(createConsumer(() => readConsumer(c1) + 1), "c2");
    const c3 = h.label(createConsumer(() => readConsumer(c2) + 1), "c3");

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
    const left = h.label(createConsumer(() => readProducer(source) + 1), "left");
    const right = h.label(createConsumer(() => readProducer(source) + 2), "right");
    const far = h.label(createConsumer(() => readProducer(source) + 3), "far");
    const wide = h.label(createConsumer(() => readProducer(source) + 4), "wide");
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
    h.expectProducerReads(["source@left", "source@right", "source@far", "source@wide"]);
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
    h.expectPropagationTargetsIncluded(["left", "right", "far", "wide", "sink"]);
    expect(summary.byType["write:producer"]).toBe(1);
    expect(summary.byType["recompute"]).toBe(5);
    h.expectNoWatcherActivity();
    h.expectNoStaleCleanup();
  });

  it("reuses a shared dependency in a diamond graph without losing correctness", () => {
    const h = createHistoryHarness();
    const source = h.label(createProducer(1), "source");
    const shared = h.label(createConsumer(() => readProducer(source) * 2), "shared");
    const left = h.label(createConsumer(() => readConsumer(shared) + 1), "left");
    const right = h.label(createConsumer(() => readConsumer(shared) + 2), "right");
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
    h.expectPropagationTargetsIncluded(["shared", "left", "right", "sink"]);
    expect(summary.byType["write:producer"]).toBe(1);
    expect(summary.byType["recompute"]).toBe(4);
    h.expectNoWatcherActivity();
    h.expectNoStaleCleanup();
    expect(
      summary.recomputes.filter((entry) => entry.startsWith("shared:")).length,
    ).toBe(1);
  });

  it("visits each node once during propagation in a diamond graph", () => {
    const h = createHistoryHarness();
    const source = h.label(createProducer(1), "source");
    const left = h.label(createConsumer(() => readProducer(source) + 1), "left");
    const right = h.label(createConsumer(() => readProducer(source) + 2), "right");
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

  it("keeps branching pull stack coherent when advance performs a nested pull", () => {
    const h = createHistoryHarness();
    const source = h.label(createProducer(1), "source");
    const probeSource = h.label(createProducer(10), "probeSource");
    const side = h.label(createProducer(100), "side");
    const probe = h.label(createConsumer(() => readProducer(probeSource) * 2), "probe");
    const left = h.label(
      createConsumer(() => readProducer(source) + readConsumer(probe)),
      "left",
    );
    const right = h.label(createConsumer(() => readProducer(side) + 1), "right");
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
    const effectA = h.label(createWatcher(() => { readProducer(source); }), "effectA");
    const effectB = h.label(createWatcher(() => { readProducer(source); }), "effectB");
    const effectC = h.label(createWatcher(() => { readProducer(source); }), "effectC");

    runWatcher(effectA);
    runWatcher(effectB);
    runWatcher(effectC);
    h.clear();

    writeProducer(source, 2);
    runWatcher(effectA);
    runWatcher(effectB);
    runWatcher(effectC);

    const summary = h.summary();
    expectSetEqual(summary.watcherInvalidations, ["effectA", "effectB", "effectC"]);
    expectProducerReads(summary, ["source@effectA", "source@effectB", "source@effectC"]);
    expectTracked(summary, ["source->effectA", "source->effectB", "source->effectC"]);
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
  });

  it("fails fast when a advance edge is detached from outgoing topology", () => {
    const source = createProducer(1);
    const shared = createConsumer(() => readProducer(source) * 2);
    const left = createConsumer(() => readConsumer(shared) + 1);
    const right = createConsumer(() => readConsumer(shared) + 2);

    expect(readConsumer(left)).toBe(3);
    expect(readConsumer(right)).toBe(4);

    writeProducer(source, 2);

    const edge = shared.firstOut;
    expect(edge).not.toBeNull();
    shared.firstOut = edge!.nextOut;
    if (shared.firstOut !== null) shared.firstOut.prevOut = null;
    edge!.prevOut = null;
    edge!.nextOut = null;

    expect(() => readConsumer(left)).toThrow(
      "advance invariant violation: edge is not attached out",
    );
  });
});
