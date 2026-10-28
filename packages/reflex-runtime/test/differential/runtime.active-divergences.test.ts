import { describe, expect, it } from "vitest";
import { resetRuntimeContext } from "../../src";
import { activeDivergenceOf, activeDivergences } from "./catalog/active";
import { DifferentialError, executeDifferential } from "./harness";

describe("active differential divergences", () => {
  if (activeDivergences.length === 0) {
    it("has no known active divergence", () => {
      expect(activeDivergences).toEqual([]);
    });
  }

  for (const divergence of activeDivergences) {
    it("reproduces " + divergence.id, () => {
      resetRuntimeContext();

      let observed: DifferentialError | undefined;
      try {
        executeDifferential(divergence.program);
      } catch (error) {
        if (!(error instanceof DifferentialError)) throw error;
        observed = error;
      }

      expect(observed).toMatchObject({
        operationIndex: divergence.operationIndex,
        expected: divergence.expected,
        actual: divergence.actual,
      });
      // The evidence that names the class still holds for its witness.
      expect(activeDivergenceOf(divergence.program)).toBe(
        divergence.id.split("-")[0],
      );
    });
  }
});
