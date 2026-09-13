import type { Observation, Op } from "./harness";

export interface ActiveDivergence {
  id: string;
  boundary: string;
  severity: "high" | "critical";
  consequence: string;
  discoveredBy: string;
  operationIndex: number;
  expected: Observation;
  actual: Observation;
  program: readonly Op[];
}

export const activeDivergences: readonly ActiveDivergence[] = [];
