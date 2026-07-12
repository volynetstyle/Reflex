import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DIRTY_STATE,
  readConsumer,
  readProducer,
  runWatcher,
  writeProducer,
} from "../../runtime.test_utils";
import {
  Changed,
  Consumer,
  Invalid,
  Visited,
  Computing,
} from "../../../src/kernel";
import { linkEdge } from "../../../src/kernel/shape/graph";
import {
  createConsumer,
  createComputeCounter,
  createProducer,
  createWatcher,
  expectIncomingEdges,
  expectIncomingPrefix,
  expecttailIn,
  hasSubscriber,
  incomingEdges,
  incomingSources,
  resetRuntime,
} from "../../runtime.test_utils";

/** Covers push/pull traversal invariants and tracked-prefix edge behavior. */
describe("Reactive runtime - traversal invariants", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it("stabilizes a shared upstream node only once per read phase", () => {
    const counter = createComputeCounter();
    const source = createProducer(1);
    const shared = createConsumer(
      counter.count("shared", () => readProducer(source) * 2),
    );
    const left = createConsumer(
      counter.count("left", () => readConsumer(shared) + 1),
    );
    const right = createConsumer(
      counter.count("right", () => readConsumer(shared) + 2),
    );
    const sink = createConsumer(
      counter.count("sink", () => readConsumer(left) + readConsumer(right)),
    );

    expect(readConsumer(sink)).toBe(7);
    counter.expectOnce(["shared", "left", "right", "sink"]);
    counter.reset();

    writeProducer(source, 2);

    expect(readConsumer(sink)).toBe(11);
    counter.expectOnce(["shared", "left", "right", "sink"]);
    counter.reset();

    expect(readConsumer(sink)).toBe(11);
    counter.expectNone();
  });

  it("marks only immediate subscribers changed when a producer writes", () => {
    const source = createProducer(1);
    const midSpy = vi.fn(() => readProducer(source) * 2);
    const mid = createConsumer(midSpy);
    const leafSpy = vi.fn(() => readConsumer(mid) + 1);
    const leaf = createConsumer(leafSpy);

    expect(readConsumer(leaf)).toBe(3);

    writeProducer(source, 2);

    expect(source.state & DIRTY_STATE).toBe(0);
    expect(mid.state & Changed).toBeTruthy();
    expect(mid.state & Invalid).toBeFalsy();
    expect(leaf.state & Invalid).toBeTruthy();
    expect(leaf.state & Changed).toBeFalsy();

    expect(readProducer(source)).toBe(2);
    expect(mid.state & Changed).toBeTruthy();
    expect(mid.state & Invalid).toBeFalsy();
    expect(leaf.state & Invalid).toBeTruthy();
    expect(leaf.state & Changed).toBeFalsy();
    expect(midSpy).toHaveBeenCalledTimes(1);
    expect(leafSpy).toHaveBeenCalledTimes(1);
  });

  it("coalesces repeated push invalidations across committed writes", () => {
    let invalidations = 0;
    resetRuntime({
      sinkInvalidatedDispatcher() {
        invalidations += 1;
      },
    });

    const left = createProducer(1);
    const right = createProducer(2);
    const effectSpy = vi.fn(() => {
      readProducer(left);
      readProducer(right);
    });
    const watcher = createWatcher(effectSpy);

    runWatcher(watcher);
    expect(effectSpy).toHaveBeenCalledTimes(1);

    writeProducer(left, 3);
    writeProducer(right, 4);

    expect(invalidations).toBe(1);
    expect(effectSpy).toHaveBeenCalledTimes(1);
    expect(watcher.state & DIRTY_STATE).toBeTruthy();

    runWatcher(watcher);
    expect(effectSpy).toHaveBeenCalledTimes(2);
    expect(invalidations).toBe(1);

    writeProducer(right, 4);
    expect(invalidations).toBe(1);
  });

  it("ignores invalidation from edges outside the current tracked prefix", () => {
    const tracked = createProducer(1);
    const stale = createProducer(2);
    const target = createConsumer(() => 0);
    const trackedEdge = linkEdge(tracked, target);
    const staleEdge = linkEdge(stale, target);

    target.state = Consumer | Computing;
    target.tailIn = trackedEdge;

    writeProducer(stale, 3);
    expect(target.state).toBe(Consumer | Computing);

    writeProducer(tracked, 2);
    expect(target.state & Computing).toBeTruthy();
    expect(target.state & Visited).toBeTruthy();
    expect(target.state & Changed).toBeFalsy();
    expect(target.state & Invalid).toBeTruthy();
  });

  it("treats tailIn as the tracked-prefix boundary while computing", () => {
    const first = createProducer(1);
    const second = createProducer(2);
    const stale = createProducer(3);
    const target = createConsumer(() => 0);
    const firstEdge = linkEdge(first, target);
    const secondEdge = linkEdge(second, target);

    linkEdge(stale, target);

    target.state = Consumer | Computing;
    target.tailIn = secondEdge;

    writeProducer(stale, 4);
    expect(target.state).toBe(Consumer | Computing);

    writeProducer(first, 5);
    expecttailIn(target, secondEdge);
    expectIncomingPrefix(target, [firstEdge, secondEdge]);
    expect(target.state & Computing).toBeTruthy();
    expect(target.state & Visited).toBeTruthy();
    expect(target.state & Changed).toBeFalsy();
    expect(target.state & Invalid).toBeTruthy();
  });

  it("surfaces Invalid -> Changed promotion to the host when the host does not dedupe", () => {
    let invalidations = 0;
    resetRuntime({
      sinkInvalidatedDispatcher() {
        invalidations += 1;
      },
    });

    const source = createProducer(1);
    const shared = createConsumer(() => readProducer(source) * 2);
    const effectSpy = vi.fn(() => {
      readConsumer(shared);
    });
    const watcher = createWatcher(effectSpy);

    runWatcher(watcher);
    expect(effectSpy).toHaveBeenCalledTimes(1);

    writeProducer(source, 2);

    expect(invalidations).toBe(1);
    expect(watcher.state & Invalid).toBeTruthy();
    expect(watcher.state & Changed).toBeFalsy();

    expect(readConsumer(shared)).toBe(4);
    expect(invalidations).toBe(2);
    expect(watcher.state & Changed).toBeTruthy();

    runWatcher(watcher);
    expect(effectSpy).toHaveBeenCalledTimes(2);
    expect(watcher.state & DIRTY_STATE).toBe(0);

    writeProducer(source, 3);
    expect(invalidations).toBe(3);
  });

  it("preserves outer dirty-check traversal when recompute reads another invalid consumer", () => {
    const source = createProducer(1);
    const nestedSource = createProducer(10);
    const nested = createConsumer(() => readProducer(nestedSource) * 2);
    const deep = createConsumer(
      () => readProducer(source) + readConsumer(nested),
    );
    const mid = createConsumer(() => readConsumer(deep) + 1);
    const root = createConsumer(() => readConsumer(mid) + 1);

    expect(readConsumer(root)).toBe(23);

    writeProducer(source, 2);
    writeProducer(nestedSource, 20);

    expect(readConsumer(root)).toBe(44);
    expect(root.state & DIRTY_STATE).toBe(0);
  });

  it("reruns a watcher after a tracked-prefix invalidation during its own execution", () => {
    const source = createProducer(0);
    const seen: number[] = [];
    const watcher = createWatcher(() => {
      const value = readProducer(source);
      seen.push(value);

      if (value < 2) {
        writeProducer(source, value + 1);
      }
    });

    runWatcher(watcher);
    expect(seen).toEqual([0]);
    expect(watcher.state & Invalid).toBeTruthy();
    expect(watcher.state & Visited).toBeTruthy();

    runWatcher(watcher);
    expect(seen).toEqual([0, 1]);
    expect(watcher.state & Invalid).toBeTruthy();

    runWatcher(watcher);
    expect(seen).toEqual([0, 1, 2]);
    expect(watcher.state & DIRTY_STATE).toBe(0);
  });

  it("keeps tracked invalidation after nested compute advances the global version", () => {
    const source = createProducer(0);
    const nestedSource = createProducer(10);
    const nested = createConsumer(() => readProducer(nestedSource) * 2);
    const seen: number[] = [];
    const watcher = createWatcher(() => {
      const value = readProducer(source);
      readConsumer(nested);
      seen.push(value);

      if (value < 1) {
        writeProducer(source, value + 1);
      }
    });

    runWatcher(watcher);

    expect(seen).toEqual([0]);
    expect(watcher.state & Computing).toBeFalsy();
    expect(watcher.state & Invalid).toBeTruthy();
    expect(watcher.state & Visited).toBeTruthy();
  });

  it("preserves nested computed tracking between producer reads", () => {
    const cases: Array<{
      name: string;
      mutate: "computed-only" | "prefix" | "suffix";
      expectedAfterNestedRun: number[];
      expectedFinalRuns: number[][];
      reentrant: boolean;
    }> = [
      {
        name: "computed-only",
        mutate: "computed-only",
        expectedAfterNestedRun: [1, 22, 10],
        expectedFinalRuns: [
          [1, 20, 10],
          [1, 22, 10],
        ],
        reentrant: false,
      },
      {
        name: "prefix",
        mutate: "prefix",
        expectedAfterNestedRun: [1, 22, 10],
        expectedFinalRuns: [
          [1, 20, 10],
          [1, 22, 10],
          [2, 22, 10],
        ],
        reentrant: true,
      },
      {
        name: "suffix",
        mutate: "suffix",
        expectedAfterNestedRun: [1, 22, 20],
        expectedFinalRuns: [
          [1, 20, 10],
          [1, 22, 20],
        ],
        reentrant: false,
      },
    ];

    for (const entry of cases) {
      resetRuntime();

      const a = createProducer(1);
      const b = createProducer(10);
      const computedSource = createProducer(10);
      let mutateDuringNestedTracking = false;
      const runs: number[][] = [];

      const computedValue = createConsumer(() => {
        const value = readProducer(computedSource);

        if (mutateDuringNestedTracking) {
          mutateDuringNestedTracking = false;

          if (entry.mutate === "prefix") {
            writeProducer(a, 2);
          } else if (entry.mutate === "suffix") {
            writeProducer(b, 20);
          }
        }

        return value * 2;
      });

      const watcher = createWatcher(() => {
        runs.push([
          readProducer(a),
          readConsumer(computedValue),
          readProducer(b),
        ]);
      });

      runWatcher(watcher);

      const initialEdges = incomingEdges(watcher);
      expect(incomingSources(watcher)).toEqual([a, computedValue, b]);

      mutateDuringNestedTracking = true;
      writeProducer(computedSource, 11);
      watcher.state |= Changed;
      runWatcher(watcher);

      expect(runs.at(-1)).toEqual(entry.expectedAfterNestedRun);
      expect(incomingSources(watcher), entry.name).toEqual([
        a,
        computedValue,
        b,
      ]);
      expect(incomingEdges(watcher), entry.name).toEqual(initialEdges);

      if (entry.reentrant) {
        expect(watcher.state & Invalid, entry.name).toBeTruthy();
        expect(watcher.state & Visited, entry.name).toBeTruthy();

        runWatcher(watcher);
      } else {
        expect(watcher.state & DIRTY_STATE, entry.name).toBe(0);
      }

      expect(runs, entry.name).toEqual(entry.expectedFinalRuns);
      expect(incomingSources(watcher), entry.name).toEqual([
        a,
        computedValue,
        b,
      ]);
      expect(incomingEdges(watcher), entry.name).toEqual(initialEdges);
      expect(watcher.state & DIRTY_STATE, entry.name).toBe(0);
    }
  });

  it("recomputes invalid consumers even when their dependency list is empty", () => {
    const depSpy = vi.fn(() => 1);
    const dep = createConsumer(depSpy);
    const root = createConsumer(() => readConsumer(dep) + 1);

    expect(readConsumer(root)).toBe(2);
    expect(depSpy).toHaveBeenCalledTimes(1);
    expectIncomingEdges(dep, []);

    dep.state |= Invalid;
    root.state |= Invalid;

    expect(readConsumer(root)).toBe(2);
    expect(depSpy).toHaveBeenCalledTimes(2);
    expect(dep.state & Invalid).toBeFalsy();
  });

  it("keeps eager stale-source unlink as the default behavior", () => {
    const toggle = createProducer(true);
    const left = createProducer(1);
    const right = createProducer(2);
    const target = createConsumer(() =>
      readProducer(toggle) ? readProducer(left) : readProducer(right),
    );

    expect(readConsumer(target)).toBe(1);
    expect(hasSubscriber(left, target)).toBe(true);
    expect(hasSubscriber(right, target)).toBe(false);

    writeProducer(toggle, false);

    expect(readConsumer(target)).toBe(2);
    expect(hasSubscriber(left, target)).toBe(false);
    expect(hasSubscriber(right, target)).toBe(true);
  });
});



