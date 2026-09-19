import { SpecMachine, ReflexMachine } from "../harness";
import { observationsEqual, DifferentialError } from "../internal/machine/eval";
import { Op, Observation } from "./types";

export function executePrograms(
  program: readonly Op[],
): Observation[] {
  const expectedMachine = new SpecMachine();
  const actualMachine = new ReflexMachine();

  return program.map((operation, index) => {
    const expected = expectedMachine.execute(operation);
    const actual = actualMachine.execute(operation);

    if (!observationsEqual(actual, expected)) {
      throw new DifferentialError(
        index,
        operation,
        expected,
        actual,
        program.slice(0, index + 1),
      );
    }

    return actual;
  });
}
