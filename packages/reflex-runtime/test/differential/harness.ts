export { SpecMachine } from "./internal/machine/SpecMachine";
export { ReflexMachine } from "./internal/machine/ReflexMachine";
export { DifferentialError, observationsEqual, evaluate, normalizeError, format } from "./internal/machine/eval";
export type { Value, NodeId, Expr, Op, NormalizedError, EffectEvent, Observation, Machine } from "./api/types";

import { ReflexMachine } from "./internal/machine/ReflexMachine";
import { SpecMachine } from "./internal/machine/SpecMachine";
import { observationsEqual, DifferentialError } from "./internal/machine/eval";
import type { Op, Observation } from "./api/types";

export function executeDifferential(program: readonly Op[]): Observation[] {
  const expectedMachine = new SpecMachine();
  const actualMachine = new ReflexMachine();
  return program.map((operation, operationIndex) => {
    const expected = expectedMachine.execute(operation);
    const actual = actualMachine.execute(operation);
    if (!observationsEqual(actual, expected)) {
      throw new DifferentialError(operationIndex, operation, expected, actual, program.slice(0, operationIndex + 1));
    }
    return actual;
  });
}
