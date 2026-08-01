import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Consumer,
  DIRTY_STATE,
  Producer,
  ReactiveNode,
  createComputeCounter,
  createConsumer,
  createProducer,
  createWatcher,
  disposeWatcher,
  expectGraphIntegrity,
  expectIncomingEdges,
  expectNoSubscriber,
  expectOutgoingEdges,
  expectRuntimeSectionHealthy,
  expectSources,
  expectSubscriber,
  getActiveRuntimeContext,
  linkEdge,
  mixedChurnPatterns,
  oscillateRotateBranchPatterns,
  oscillateRotateSwapPatterns,
  prefixSuffixChaoticPatterns,
  readConsumer,
  readProducer,
  resetRuntime,
  restoreRuntimeContextSnapshot,
  rotatePatterns,
  runPatternScenario,
  runWatcher,
  snapshotRuntimeContext,
  setCurrentConsumer,
  keepNewestTrackingEpoch,
  trackingEpoch,
  unlinkEdge,
  writeProducer,
  branchSwapPatterns,
} from "../../runtime.test_utils";

type SectionCase = {
  name: string;
  run(): void;
};

function createNode(kind: typeof Producer | typeof Consumer) {
  return new ReactiveNode(undefined, undefined, kind);
}

describe("Reactive runtime - section model coverage", () => {
  beforeEach(() => {
    resetRuntime();
  });

  describe("Graph Wiring Model", () => {
    const cases: SectionCase[] = [
      {
        name: "link/unlink keeps incoming and outgoing lists bidirectional",
        run() {
          const source = createNode(Producer);
          const target = createNode(Consumer);

          const edge = linkEdge(source, target);

          expectIncomingEdges(target, [edge]);
          expectOutgoingEdges(source, [edge]);

          unlinkEdge(edge);

          expectIncomingEdges(target, []);
          expectOutgoingEdges(source, []);
          expectRuntimeSectionHealthy([source, target]);
        },
      },
      {
        name: "unlink removes a selected parallel edge without touching siblings",
        run() {
          const source = createNode(Producer);
          const target = createNode(Consumer);

          const first = linkEdge(source, target);
          const second = linkEdge(source, target);

          expectIncomingEdges(target, [first, second]);
          expectOutgoingEdges(source, [first, second]);

          unlinkEdge(first);

          expectIncomingEdges(target, [second]);
          expectOutgoingEdges(source, [second]);
          expectRuntimeSectionHealthy([source, target]);
        },
      },
    ];

    it.each(cases)("$name", ({ run }) => {
      run();
    });
  });

  describe("Tracking Shape Model", () => {
    const cases = [
      {
        name: "static dependency order",
        deps: 40,
        patterns: [Array.from({ length: 40 }, (_, index) => index)],
        steps: 4,
      },
      {
        name: "rotate retained dependency set",
        deps: 40,
        patterns: rotatePatterns(40, 4),
        steps: 4,
      },
      {
        name: "full branch swap",
        deps: 40,
        patterns: branchSwapPatterns(40),
        steps: 4,
      },
      {
        name: "mixed retained/replaced churn",
        deps: 40,
        patterns: mixedChurnPatterns(40, 4),
        steps: 4,
      },
      {
        name: "chaotic prefix/suffix retained dependency set",
        deps: 40,
        patterns: prefixSuffixChaoticPatterns(40, 8),
        steps: 8,
      },
      {
        name: "oscillating rotate and branch dependency set",
        deps: 40,
        patterns: oscillateRotateBranchPatterns(40, 8),
        steps: 8,
      },
      {
        name: "oscillating rotate and local swap order",
        deps: 40,
        patterns: oscillateRotateSwapPatterns(40, 8),
        steps: 8,
      },
    ];

    it.each(cases)("$name preserves exact source shape", (scenario) => {
      runPatternScenario(scenario);
    });

    it("dedupes repeated reads after a large stale-suffix cleanup", () => {
      runPatternScenario({
        name: "branch swap with repeated fresh dep",
        deps: 40,
        patterns: [
          Array.from({ length: 40 }, (_, index) => index),
          [...Array.from({ length: 40 }, (_, index) => index + 40), 40, 40],
        ],
        steps: 2,
      });
    });
  });

  describe("Propagation/Recompute Model", () => {
    const cases: SectionCase[] = [
      {
        name: "linear graph recomputes every affected node once",
        run() {
          const counter = createComputeCounter();
          const source = createProducer(1);
          const first = createConsumer(
            counter.count("first", () => readProducer(source) + 1),
          );
          const second = createConsumer(
            counter.count("second", () => readConsumer(first) + 1),
          );
          const third = createConsumer(
            counter.count("third", () => readConsumer(second) + 1),
          );

          expect(readConsumer(third)).toBe(4);
          counter.reset();

          writeProducer(source, 2);

          expect(readConsumer(third)).toBe(5);
          counter.expectOnce(["first", "second", "third"]);
          expectRuntimeSectionHealthy([source, first, second, third]);
        },
      },
      {
        name: "diamond graph recomputes shared node once",
        run() {
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
            counter.count(
              "sink",
              () => readConsumer(left) + readConsumer(right),
            ),
          );

          expect(readConsumer(sink)).toBe(7);
          counter.reset();

          writeProducer(source, 2);

          expect(readConsumer(sink)).toBe(11);
          counter.expectOnce(["shared", "left", "right", "sink"]);
          expectRuntimeSectionHealthy([source, shared, left, right, sink]);
        },
      },
      {
        name: "dynamic branch drops stale producer and keeps active producer",
        run() {
          const gate = createProducer(true);
          const left = createProducer(10);
          const right = createProducer(20);
          const selected = createConsumer(() =>
            readProducer(gate) ? readProducer(left) : readProducer(right),
          );

          expect(readConsumer(selected)).toBe(10);

          writeProducer(gate, false);

          expect(readConsumer(selected)).toBe(20);
          expectSources(selected, [gate, right]);
          expectNoSubscriber(left, selected);
          expectSubscriber(right, selected);
          expectRuntimeSectionHealthy([gate, left, right, selected]);
        },
      },
    ];

    it.each(cases)("$name", ({ run }) => {
      run();
    });
  });

  describe("Scheduler/Watcher Model", () => {
    const cases: SectionCase[] = [
      {
        name: "direct watcher fanout invalidates every watcher once",
        run() {
          const invalidated: string[] = [];
          const source = createProducer(1);
          const watchers = ["left", "right", "far"].map((label) => {
            const watcher = createWatcher(() => {
              readProducer(source);
            });

            return { label, watcher };
          });

          resetRuntime({
            onNodeInvalidated(node) {
              const hit = watchers.find((entry) => entry.watcher === node);
              if (hit) invalidated.push(hit.label);
            },
          });

          for (const { watcher } of watchers) {
            runWatcher(watcher);
          }

          writeProducer(source, 2);
          writeProducer(source, 3);

          expect(invalidated).toEqual(["left", "right", "far"]);
          for (const { watcher } of watchers) {
            expect(watcher.state & DIRTY_STATE).toBeTruthy();
          }
          expectRuntimeSectionHealthy([
            source,
            ...watchers.map((entry) => entry.watcher),
          ]);
        },
      },
      {
        name: "disposed watcher is absent from future invalidations",
        run() {
          const source = createProducer(1);
          const watcher = createWatcher(() => {
            readProducer(source);
          });
          const invalidated = vi.fn();

          resetRuntime({ onNodeInvalidated: invalidated });
          runWatcher(watcher);
          disposeWatcher(watcher);
          writeProducer(source, 2);

          expect(invalidated).not.toHaveBeenCalled();
          expectRuntimeSectionHealthy([source, watcher]);
        },
      },
    ];

    it.each(cases)("$name", ({ run }) => {
      run();
    });
  });

  describe("Lifecycle/Context Model", () => {
    const cases: SectionCase[] = [
      {
        name: "throwing compute restores current consumer and leaves no poisoned state",
        run() {
          const source = createProducer(1);
          const target = createConsumer(() => {
            readProducer(source);
            throw new Error("boom");
          });

          expect(() => readConsumer(target)).toThrow("boom");
          expectRuntimeSectionHealthy([source, target]);
        },
      },
      {
        name: "context restore does not roll tracking epoch backwards",
        run() {
          keepNewestTrackingEpoch(1);
          const snapshot = snapshotRuntimeContext();

          keepNewestTrackingEpoch(3);
          restoreRuntimeContextSnapshot(getActiveRuntimeContext(), snapshot);

          expect(trackingEpoch).toBe(3);
          expectRuntimeSectionHealthy([]);
        },
      },
      {
        name: "watcher cleanup reads outside parent tracking",
        run() {
          const trigger = createProducer(0);
          const incidental = createProducer(0);
          const parent = createConsumer(() => 0);
          const watcher = createWatcher(() => {
            readProducer(trigger);

            return () => {
              readProducer(incidental);
            };
          });

          runWatcher(watcher);
          writeProducer(trigger, 1);
          setCurrentConsumer(parent);
          try {
            runWatcher(watcher);
          } finally {
            setCurrentConsumer(null);
          }

          expectNoSubscriber(incidental, parent);
          expectRuntimeSectionHealthy([trigger, incidental, parent, watcher]);
        },
      },
    ];

    it.each(cases)("$name", ({ run }) => {
      run();
    });
  });
});
