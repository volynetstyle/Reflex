import { observationsEqual } from "../internal/machine/eval";
import { compare } from "./differential";
import type {
  OperationAlignment,
  Program,
  TransformationMismatch,
  TransformationResult,
} from "./types";

export interface TransformationComparison {
  readonly base: Program;
  readonly transformed: Program;
  readonly alignment: readonly OperationAlignment[];
}

export function compareTransformation({
  base,
  transformed,
  alignment,
}: TransformationComparison): TransformationResult {
  const baseResult = compare(base);
  const transformedResult = compare(transformed);
  const mismatches: TransformationMismatch[] = [];

  for (const pair of alignment) {
    const baseExpected = baseResult.expected[pair.base];
    const transformedExpected = transformedResult.expected[pair.transformed];
    const baseActual = baseResult.actual[pair.base];
    const transformedActual = transformedResult.actual[pair.transformed];

    if (
      baseExpected === undefined ||
      transformedExpected === undefined ||
      baseActual === undefined ||
      transformedActual === undefined
    ) {
      throw new RangeError(
        `Invalid transformation alignment ${pair.base} -> ${pair.transformed}`,
      );
    }

    if (!observationsEqual(baseExpected, transformedExpected)) {
      mismatches.push({
        target: "spec",
        baseOperationIndex: pair.base,
        transformedOperationIndex: pair.transformed,
        base: baseExpected,
        transformed: transformedExpected,
      });
    }

    if (!observationsEqual(baseActual, transformedActual)) {
      mismatches.push({
        target: "reflex",
        baseOperationIndex: pair.base,
        transformedOperationIndex: pair.transformed,
        base: baseActual,
        transformed: transformedActual,
      });
    }
  }

  return {
    base: baseResult,
    transformed: transformedResult,
    specEquivalent: !mismatches.some(({ target }) => target === "spec"),
    reflexEquivalent: !mismatches.some(({ target }) => target === "reflex"),
    mismatches,
  };
}
