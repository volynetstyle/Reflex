import { beforeEach, describe, expect, it } from "vitest";
import {
  readConsumer,
  readProducer,
  runWatcher,
  subtle,
  type RuntimeDebugEvent,
  writeProducer,
} from "../src/debug";
import {
  createConsumer,
  createProducer,
  createWatcher,
  resetRuntime,
} from "./runtime.test_utils";

type EventSummary = {
  byType: Record<string, number>;
  trackReads: string[];
  producerReads: string[];
  consumerReads: string[];
  recomputes: string[];
  propagations: string[];
  watcherInvalidations: string[];
  watcherRuns: string[];
  staleCleanups: string[];
};

function countByType(events: RuntimeDebugEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const event of events) {
    counts[event.type] = (counts[event.type] ?? 0) + 1;
  }

  return counts;
}

function labelOf(
  ref:
    | RuntimeDebugEvent["consumer"]
    | RuntimeDebugEvent["node"]
    | RuntimeDebugEvent["source"]
    | RuntimeDebugEvent["target"],
): string {
  return ref?.label ?? `#${ref?.id ?? "?"}`;
}

function summarize(events: RuntimeDebugEvent[]): EventSummary {
  const trackReads: string[] = [];
  const producerReads: string[] = [];
  const consumerReads: string[] = [];
  const recomputes: string[] = [];
  const propagations: string[] = [];
  const watcherInvalidations: string[] = [];
  const watcherRuns: string[] = [];
  const staleCleanups: string[] = [];

  for (const event of events) {
    if (event.type === "track:read") {
      trackReads.push(`${labelOf(event.source)}->${labelOf(event.consumer)}`);
      continue;
    }

    if (event.type === "read:producer") {
      producerReads.push(`${labelOf(event.node)}@${labelOf(event.consumer)}`);
      continue;
    }

    if (event.type === "read:consumer") {
      const mode = String(event.detail?.mode ?? "?");
      consumerReads.push(
        `${labelOf(event.node)}:${mode}@${labelOf(event.consumer)}`,
      );
      continue;
    }

    if (event.type === "recompute") {
      const changed = event.detail?.changed === true ? "changed" : "stable";
      recomputes.push(`${labelOf(event.node)}:${changed}`);
      continue;
    }

    if (event.type === "propagate") {
      const immediate = event.detail?.immediate === true ? "!" : "~";
      propagations.push(
        `${labelOf(event.source)}-${immediate}>${labelOf(event.target)}`,
      );
      continue;
    }

    if (event.type === "watcher:invalidated") {
      watcherInvalidations.push(labelOf(event.node));
      continue;
    }

    if (
      event.type === "watcher:run:start" ||
      event.type === "watcher:run:finish" ||
      event.type === "watcher:run:skip"
    ) {
      watcherRuns.push(`${event.type}:${labelOf(event.node)}`);
      continue;
    }

    if (event.type === "cleanup:stale-sources") {
      const removedSources = Array.isArray(event.detail?.removedSources)
        ? event.detail.removedSources
            .map((ref) =>
              typeof ref === "object" && ref !== null && "label" in ref
                ? String(ref.label ?? "#?")
                : "#?",
            )
            .join(",")
        : "";

      staleCleanups.push(
        `${labelOf(event.node)}:${String(event.detail?.removedCount ?? 0)}:${removedSources}`,
      );
    }
  }

  return {
    byType: countByType(events),
    trackReads,
    producerReads,
    consumerReads,
    recomputes,
    propagations,
    watcherInvalidations,
    watcherRuns,
    staleCleanups,
  };
}

function createHistoryHarness() {
  resetRuntime();
  subtle.configure({ historyLimit: 1_000 });

  return {
    label<T>(node: T, label: string): T {
      return subtle.label(node as never, label) as T;
    },
    clear() {
      subtle.clearHistory();
    },
    summary(): EventSummary {
      return summarize(subtle.history());
    },
  };
}

function expectContainsAll(actual: string[], expected: string[]): void {
  for (const item of expected) {
    expect(actual).toContain(item);
  }
}

function expectSetEqual(actual: string[], expected: string[]): void {
  expect(new Set(actual)).toEqual(new Set(expected));
}

function expectRecomputed(summary: EventSummary, labels: string[]): void {
  const actual = summary.recomputes.map((entry) => entry.split(":")[0]);
  expectSetEqual(actual, labels);
}

function expectChanged(summary: EventSummary, labels: string[]): void {
  for (const label of labels) {
    expect(summary.recomputes).toContain(`${label}:changed`);
  }
}

function expectProducerReads(summary: EventSummary, expected: string[]): void {
  expectSetEqual(summary.producerReads, expected);
}

function expectTracked(summary: EventSummary, expected: string[]): void {
  expectContainsAll(summary.trackReads, expected);
}

function expectNoWatcherActivity(summary: EventSummary): void {
  expect(summary.watcherInvalidations).toEqual([]);
  expect(summary.watcherRuns).toEqual([]);
}

function expectNoStaleCleanup(summary: EventSummary): void {
  expect(summary.staleCleanups).toEqual([]);
}

function expectPropagationTargetsIncluded(
  summary: EventSummary,
  expectedTargets: string[],
): void {
  const targets = summary.propagations.map((entry) => {
    const arrowIndex = entry.indexOf(">");
    return entry.slice(arrowIndex + 1);
  });

  for (const target of expectedTargets) {
    expect(targets).toContain(target);
  }
}

function expectPropagationTargetsVisitedOnce(
  summary: EventSummary,
  expectedTargets: string[],
): void {
  const counts = new Map<string, number>();

  for (const entry of summary.propagations) {
    const arrowIndex = entry.indexOf(">");
    const target = entry.slice(arrowIndex + 1);
    counts.set(target, (counts.get(target) ?? 0) + 1);
  }

  for (const target of expectedTargets) {
    expect(counts.get(target)).toBe(1);
  }
}

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

    expectChanged(summary, ["c1", "c2", "c3"]);
    expectRecomputed(summary, ["c1", "c2", "c3"]);

    expectTracked(summary, ["source->c1", "c1->c2", "c2->c3"]);
    expectProducerReads(summary, ["source@c1"]);
    expect(summary.consumerReads).toContain("c1:lazy@c2");
    expect(summary.consumerReads).toContain("c2:lazy@c3");
    expect(summary.consumerReads).toContain("c3:lazy@#?");

    expectPropagationTargetsIncluded(summary, ["c1", "c2", "c3"]);
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

    expectChanged(summary, ["left", "right", "far", "wide", "sink"]);
    expectRecomputed(summary, ["left", "right", "far", "wide", "sink"]);

    expectProducerReads(summary, [
      "source@left",
      "source@right",
      "source@far",
      "source@wide",
    ]);

    expectTracked(summary, [
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

    expectPropagationTargetsIncluded(summary, [
      "left",
      "right",
      "far",
      "wide",
      "sink",
    ]);

    expect(summary.byType["write:producer"]).toBe(1);
    expect(summary.byType["recompute"]).toBe(5);

    expectNoWatcherActivity(summary);
    expectNoStaleCleanup(summary);
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

    expectChanged(summary, ["shared", "left", "right", "sink"]);
    expectRecomputed(summary, ["shared", "left", "right", "sink"]);

    expectProducerReads(summary, ["source@shared"]);
    expectTracked(summary, [
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

    expectPropagationTargetsIncluded(summary, [
      "shared",
      "left",
      "right",
      "sink",
    ]);

    expect(summary.byType["write:producer"]).toBe(1);
    expect(summary.byType["recompute"]).toBe(4);

    expectNoWatcherActivity(summary);
    expectNoStaleCleanup(summary);

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
});
