import fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";
import {
  readConsumer,
  readProducer,
  writeProducer,
} from "../../runtime.test_utils";
import {
  createComputeCounter,
  createConsumer,
  createProducer,
  expectGraphIntegrity,
  expectSources,
  resetRuntime,
} from "../../runtime.test_utils";

/** Covers generated-DAG property checks for recompute cardinality and integrity. */
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

  // SEMANTIC_CONTRACT C1, C3: a failed computed is Changed, so its next demand
  // executes it exactly once, whatever its retained incoming relation and
  // however many upstream writes came in between; that relation holds only
  // what the failed attempt read.
  it("a failed computed runs once on the next demand, whatever was written in between", () => {
    const pattern = fc.record({
      order: fc.uniqueArray(fc.integer({ min: 0, max: 7 }), { maxLength: 8 }),
      failAt: fc.integer({ min: 0, max: 8 }),
    });
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: 7 }), { minLength: 1 }),
        fc.array(pattern, { minLength: 1, maxLength: 3 }),
        fc.array(
          fc.tuple(
            fc.integer({ min: 0, max: 7 }),
            fc.integer({ min: 0, max: 3 }),
          ),
          { maxLength: 6 },
        ),
        (committed, failing, writes) => {
          resetRuntime();

          const sources = Array.from({ length: 8 }, (_, index) =>
            createProducer(index),
          );
          const phase = createProducer(-1);
          const sibling = createConsumer(() =>
            sources.reduce((sum, source) => sum + readProducer(source), 0),
          );
          let runs = 0;
          const computed = createConsumer(() => {
            runs += 1;
            const index = readProducer(phase);
            const { order, failAt } =
              index < 0 ? { order: committed, failAt: 8 } : failing[index]!;
            let sum = 0;
            for (let i = 0; i < order.length; i += 1) {
              if (i === failAt) throw new Error("failed attempt");
              sum += readProducer(sources[order[i]!]!);
            }
            if (index >= 0) throw new Error("failed attempt");
            return sum;
          });
          const demand = () => {
            const before = runs;
            let threw = false;
            try {
              readConsumer(computed);
            } catch {
              threw = true;
            }
            return { executions: runs - before, threw };
          };

          readConsumer(sibling);
          expect(demand()).toEqual({ executions: 1, threw: false });

          for (let index = 0; index < failing.length; index += 1) {
            writeProducer(phase, index);
            expect(demand()).toEqual({ executions: 1, threw: true });
            const { order, failAt } = failing[index]!;
            expectSources(computed, [
              phase,
              ...order.slice(0, failAt).map((i) => sources[i]!),
            ]);
          }

          for (const [source, value] of writes)
            writeProducer(sources[source]!, value);
          expect(demand()).toEqual({ executions: 1, threw: true });
          // Still failed, so still Changed: the next demand runs it again.
          expect(demand()).toEqual({ executions: 1, threw: true });

          writeProducer(phase, -1);
          expect(demand()).toEqual({ executions: 1, threw: false });
          expect(demand()).toEqual({ executions: 0, threw: false });
          expectSources(computed, [
            phase,
            ...committed.map((i) => sources[i]!),
          ]);
          expectGraphIntegrity([...sources, phase, sibling, computed]);
        },
      ),
      { numRuns: 300 },
    );
  });
});
