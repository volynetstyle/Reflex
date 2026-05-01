import fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";
import { readConsumer, readProducer, writeProducer } from "../src";
import {
  createComputeCounter,
  createConsumer,
  createProducer,
  expectGraphIntegrity,
  resetRuntime,
} from "./runtime.test_utils";

describe("Reactive runtime - generated topology properties", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it("recomputes each affected generated DAG node once and preserves graph integrity", () => {
    fc.assert(
      fc.property(
        fc.record({
          depth: fc.integer({ min: 1, max: 4 }),
          width: fc.integer({ min: 1, max: 4 }),
        }),
        ({ depth, width }) => {
          resetRuntime();

          const counter = createComputeCounter();
          const source = createProducer(1);
          const nodes = [source];
          let previousLevel = [
            createConsumer(
              counter.count("n0_0", () => readProducer(source) + 1),
            ),
          ];
          nodes.push(...previousLevel);

          for (let level = 1; level < depth; level += 1) {
            const inputs = previousLevel;
            const currentLevel = Array.from({ length: width }, (_, index) =>
              createConsumer(
                counter.count(`n${level}_${index}`, () =>
                  inputs.reduce((sum, node) => sum + readConsumer(node), index),
                ),
              ),
            );
            nodes.push(...currentLevel);
            previousLevel = currentLevel;
          }

          const root = createConsumer(
            counter.count("root", () =>
              previousLevel.reduce((sum, node) => sum + readConsumer(node), 0),
            ),
          );
          nodes.push(root);

          readConsumer(root);
          counter.reset();

          writeProducer(source, 2);
          readConsumer(root);

          const expectedLabels = [
            ...Array.from({ length: depth }, (_, level) =>
              Array.from(
                { length: level === 0 ? 1 : width },
                (_unused, index) => `n${level}_${index}`,
              ),
            ).flat(),
            "root",
          ];

          counter.expectOnce(expectedLabels);
          expectGraphIntegrity(nodes);
        },
      ),
      { numRuns: 50 },
    );
  });
});
