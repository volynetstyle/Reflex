import { beforeEach, describe, expect, it } from "vitest";
import {
  configureRuntimeContext,
  createConsumer,
  createProducer,
  createWatcher,
  readConsumer,
  readProducer,
  resetRuntimeContext,
  runWatcher,
  writeProducer,
} from "../../../src";
import { claimWatcherSchedule } from "@runtime/kernel/engine/watcher";
import {
  Both as RuntimeBoth,
  Changed as RuntimeChanged,
  Scheduled,
  Unknown as RuntimeUnknown,
  type WatcherNode,
} from "@runtime/kernel/shape";

import {
  complementEvidence,
  Evidence,
  evidenceLeq,
  evidenceValues,
  joinEvidence,
  meetEvidence,
} from "./model";

describe("watcher evidence Boolean algebra", () => {
  it("satisfies the finite Boolean and lattice laws", () => {
    for (const left of evidenceValues) {
      expect(joinEvidence(left, Evidence.None)).toBe(left);
      expect(meetEvidence(left, Evidence.Both)).toBe(left);
      expect(joinEvidence(left, Evidence.Both)).toBe(Evidence.Both);
      expect(meetEvidence(left, Evidence.None)).toBe(Evidence.None);
      expect(joinEvidence(left, left)).toBe(left);
      expect(meetEvidence(left, left)).toBe(left);
      expect(joinEvidence(left, complementEvidence(left))).toBe(Evidence.Both);
      expect(meetEvidence(left, complementEvidence(left))).toBe(Evidence.None);
      expect(complementEvidence(complementEvidence(left))).toBe(left);
      expect(evidenceLeq(Evidence.None, left)).toBe(true);
      expect(evidenceLeq(left, Evidence.Both)).toBe(true);
      expect(evidenceLeq(left, left)).toBe(true);

      for (const right of evidenceValues) {
        expect(joinEvidence(left, right)).toBe(joinEvidence(right, left));
        expect(meetEvidence(left, right)).toBe(meetEvidence(right, left));
        expect(joinEvidence(left, meetEvidence(left, right))).toBe(left);
        expect(meetEvidence(left, joinEvidence(left, right))).toBe(left);
        expect(complementEvidence(joinEvidence(left, right))).toBe(
          meetEvidence(complementEvidence(left), complementEvidence(right)),
        );
        expect(complementEvidence(meetEvidence(left, right))).toBe(
          joinEvidence(complementEvidence(left), complementEvidence(right)),
        );

        if (evidenceLeq(left, right) && evidenceLeq(right, left)) {
          expect(left).toBe(right);
        }

        const join = joinEvidence(left, right);
        const meet = meetEvidence(left, right);
        expect(evidenceLeq(left, join)).toBe(true);
        expect(evidenceLeq(right, join)).toBe(true);
        expect(evidenceLeq(meet, left)).toBe(true);
        expect(evidenceLeq(meet, right)).toBe(true);

        for (const third of evidenceValues) {
          if (evidenceLeq(left, right) && evidenceLeq(right, third)) {
            expect(evidenceLeq(left, third)).toBe(true);
          }
          if (evidenceLeq(left, third) && evidenceLeq(right, third)) {
            expect(evidenceLeq(join, third)).toBe(true);
          }
          if (evidenceLeq(third, left) && evidenceLeq(third, right)) {
            expect(evidenceLeq(third, meet)).toBe(true);
          }

          expect(joinEvidence(joinEvidence(left, right), third)).toBe(
            joinEvidence(left, joinEvidence(right, third)),
          );
          expect(meetEvidence(meetEvidence(left, right), third)).toBe(
            meetEvidence(left, meetEvidence(right, third)),
          );
          expect(meetEvidence(left, joinEvidence(right, third))).toBe(
            joinEvidence(meetEvidence(left, right), meetEvidence(left, third)),
          );
          expect(joinEvidence(left, meetEvidence(right, third))).toBe(
            meetEvidence(joinEvidence(left, right), joinEvidence(left, third)),
          );
        }
      }
    }
  });

  it("corresponds to the runtime evidence bit representation", () => {
    expect(RuntimeUnknown).toBe(Evidence.Unknown);
    expect(RuntimeChanged).toBe(Evidence.Changed);
    expect(RuntimeBoth).toBe(Evidence.Both);
  });
});

describe("role-specific production evidence transitions", () => {
  beforeEach(() => resetRuntimeContext());

  it("joins Unknown then Changed for a watcher without rescheduling", () => {
    const graph = createMixedGraph();
    let notifications = 0;
    configureRuntimeContext({
      hooks: {
        onNodeInvalidated(node) {
          if (node !== graph.watcher) return;
          notifications += 1;
          claimWatcherSchedule(node as WatcherNode);
        },
      },
    });

    writeProducer(graph.derivedSource, 1);
    writeProducer(graph.direct, 1);

    expect(graph.watcher.state & RuntimeBoth).toBe(RuntimeBoth);
    expect(graph.watcher.state & Scheduled).toBe(Scheduled);
    expect(notifications).toBe(1);

    writeProducer(graph.direct, 2);
    writeProducer(graph.derivedSource, 2);

    expect(graph.watcher.state & RuntimeBoth).toBe(RuntimeBoth);
    expect(graph.watcher.state & Scheduled).toBe(Scheduled);
    expect(notifications).toBe(1);
  });

  it("joins Changed then Unknown for a watcher without rescheduling", () => {
    const graph = createMixedGraph();
    let notifications = 0;
    configureRuntimeContext({
      hooks: {
        onNodeInvalidated(node) {
          if (node !== graph.watcher) return;
          notifications += 1;
          claimWatcherSchedule(node as WatcherNode);
        },
      },
    });

    writeProducer(graph.direct, 1);
    writeProducer(graph.derivedSource, 1);

    expect(graph.watcher.state & RuntimeBoth).toBe(RuntimeBoth);
    expect(graph.watcher.state & Scheduled).toBe(Scheduled);
    expect(notifications).toBe(1);
  });

  it("keeps Changed dominant for an ordinary computed", () => {
    const direct = createProducer(0);
    const derivedSource = createProducer(0);
    const derived = createConsumer(() => readProducer(derivedSource));
    const outer = createConsumer(
      () => readProducer(direct) + readConsumer(derived),
    );

    readConsumer(outer);
    writeProducer(direct, 1);
    writeProducer(derivedSource, 1);

    expect(outer.state & RuntimeBoth).toBe(RuntimeChanged);
  });
});

function createMixedGraph() {
  const direct = createProducer(0);
  const derivedSource = createProducer(0);
  const derived = createConsumer(() => readProducer(derivedSource));
  const watcher = createWatcher(() => {
    readProducer(direct);
    readConsumer(derived);
  });

  runWatcher(watcher);
  return { direct, derivedSource, watcher };
}
