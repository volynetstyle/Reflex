import fc from "fast-check";
import { beforeEach, describe, it } from "vitest";
import {
  createRecomputationModel,
  resetRuntime,
  type ModelOperation,
  type ModelRow,
} from "../../runtime.test_utils";

const rowArbitrary: fc.Arbitrary<ModelRow> = fc.record({
  alive: fc.boolean(),
  group: fc.integer({ min: 0, max: 2 }),
  order: fc.integer({ min: -3, max: 3 }),
  value: fc.integer({ min: -100, max: 100 }),
});

const operationArbitrary: fc.Arbitrary<ModelOperation> = fc.oneof(
  fc.record({
    type: fc.constant("write" as const),
    row: fc.nat(),
    value: fc.integer({ min: -100, max: 100 }),
  }),
  fc.record({
    type: fc.constant("move" as const),
    row: fc.nat(),
    order: fc.integer({ min: -3, max: 3 }),
  }),
  fc.record({
    type: fc.constant("regroup" as const),
    row: fc.nat(),
    group: fc.integer({ min: 0, max: 2 }),
  }),
  fc.record({
    type: fc.constant("toggle" as const),
    row: fc.nat(),
  }),
  fc.record({
    type: fc.constant("select" as const),
    group: fc.integer({ min: 0, max: 2 }),
  }),
);

describe("Reactive runtime - incremental/full recomputation equivalence", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it("matches a fresh recomputation after every generated state transition", () => {
    fc.assert(
      fc.property(
        fc.array(rowArbitrary, { minLength: 1, maxLength: 8 }),
        fc.array(operationArbitrary, { minLength: 1, maxLength: 60 }),
        (rows, operations) => {
          resetRuntime();
          const model = createRecomputationModel(rows);

          model.assertEquivalent();
          for (const operation of operations) {
            model.apply(operation);
            model.assertEquivalent();
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("replaces deleted extrema and restores late rows in deterministic order", () => {
    const model = createRecomputationModel([
      { alive: true, group: 0, order: 2, value: 7 },
      { alive: true, group: 0, order: 1, value: -5 },
      { alive: false, group: 0, order: 0, value: 99 },
    ]);

    const history: ModelOperation[] = [
      { type: "toggle", row: 1 },
      { type: "toggle", row: 2 },
      { type: "move", row: 0, order: -1 },
      { type: "write", row: 2, value: 7 },
      { type: "regroup", row: 0, group: 1 },
      { type: "select", group: 1 },
    ];

    model.assertEquivalent();
    for (const operation of history) {
      model.apply(operation);
      model.assertEquivalent();
    }
  });
});
