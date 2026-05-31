import { beforeEach, describe, expect, it } from "vitest";
import { readConsumer, readProducer, writeProducer } from "../../runtime.test_utils";
import {
  createConsumer,
  createComputeCounter,
  createProducer,
  resetRuntime,
} from "../../runtime.test_utils";

/** Covers recompute cardinality across representative topology shapes. */
describe("Reactive runtime - topology recompute cardinality", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it.each([
    {
      name: "linear chain",
      build() {
        const counter = createComputeCounter();
        const source = createProducer(1);
        const c1 = createConsumer(
          counter.count("c1", () => readProducer(source) + 1),
        );
        const c2 = createConsumer(
          counter.count("c2", () => readConsumer(c1) + 1),
        );
        const c3 = createConsumer(
          counter.count("c3", () => readConsumer(c2) + 1),
        );

        return {
          counter,
          expected: 5,
          labels: ["c1", "c2", "c3"],
          read: () => readConsumer(c3),
          update: () => writeProducer(source, 2),
          warm: 4,
        };
      },
    },
    {
      name: "diamond",
      build() {
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

        return {
          counter,
          expected: 11,
          labels: ["shared", "left", "right", "sink"],
          read: () => readConsumer(sink),
          update: () => writeProducer(source, 2),
          warm: 7,
        };
      },
    },
    {
      name: "wide fan-out into one sink",
      build() {
        const counter = createComputeCounter();
        const source = createProducer(1);
        const leaves = ["left", "right", "far", "wide"].map((label, index) =>
          createConsumer(
            counter.count(label, () => readProducer(source) + index + 1),
          ),
        );
        const sink = createConsumer(
          counter.count("sink", () =>
            leaves.reduce((sum, leaf) => sum + readConsumer(leaf), 0),
          ),
        );

        return {
          counter,
          expected: 18,
          labels: ["left", "right", "far", "wide", "sink"],
          read: () => readConsumer(sink),
          update: () => writeProducer(source, 2),
          warm: 14,
        };
      },
    },
    {
      name: "dynamic branch switch",
      build() {
        const counter = createComputeCounter();
        const gate = createProducer(true);
        const left = createProducer(10);
        const right = createProducer(20);
        const selected = createConsumer(
          counter.count("selected", () =>
            readProducer(gate) ? readProducer(left) : readProducer(right),
          ),
        );

        return {
          counter,
          expected: 20,
          labels: ["selected"],
          read: () => readConsumer(selected),
          update: () => writeProducer(gate, false),
          warm: 10,
        };
      },
    },
    {
      name: "repeated branch reads",
      build() {
        const counter = createComputeCounter();
        const head = createProducer(0);
        const double = createConsumer(
          counter.count("double", () => readProducer(head) * 2),
        );
        const inverse = createConsumer(
          counter.count("inverse", () => -readProducer(head)),
        );
        const current = createConsumer(
          counter.count("current", () => {
            let result = 0;

            for (let index = 0; index < 20; index += 1) {
              result +=
                readProducer(head) % 2
                  ? readConsumer(double)
                  : readConsumer(inverse);
            }

            return result;
          }),
        );

        return {
          counter,
          expected: 40,
          labels: ["double", "current"],
          read: () => readConsumer(current),
          update: () => writeProducer(head, 1),
          warm: 0,
        };
      },
    },
  ])("$name recomputes every affected computed node once", ({ build }) => {
    const topology = build();

    expect(topology.read()).toBe(topology.warm);
    topology.counter.reset();

    topology.update();
    expect(topology.read()).toBe(topology.expected);

    topology.counter.expectOnce(topology.labels);
  });
});



