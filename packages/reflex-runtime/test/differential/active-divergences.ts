import type { Expr, Observation, Op } from "./harness";

export interface ActiveDivergence {
  id: "cleanup-before-validation-completes";
  boundary: string;
  severity: "high" | "critical";
  consequence: string;
  discoveredBy: string;
  operationIndex: number;
  expected: Observation;
  actual: Observation;
  program: readonly Op[];
}

const read = (id: string): Expr => ({ type: "read", id });

export const activeDivergences: readonly ActiveDivergence[] = [
  {
    id: "cleanup-before-validation-completes",
    boundary: "watcher lifecycle / dependency validation",
    severity: "high",
    consequence:
      "Cleanup performs irreversible work even though validation failed before rerun could begin.",
    discoveredBy: "bounded failure-recovery continuation generation",
    operationIndex: 8,
    expected: {
      error: { name: "Error", message: "bounded failure" },
      effects: [],
    },
    actual: {
      error: { name: "Error", message: "bounded failure" },
      effects: [{ effect: "watcher", phase: "cleanup", value: true }],
    },
    program: [
      { type: "signal", id: "condition", value: false },
      { type: "signal", id: "fallback", value: false },
      {
        type: "computed",
        id: "computed",
        expression: {
          type: "if",
          condition: read("condition"),
          then: { type: "throw", message: "bounded failure" },
          else: read("fallback"),
        },
      },
      {
        type: "effect",
        id: "watcher",
        expression: read("computed"),
        cleanup: read("condition"),
      },
      { type: "flush" },
      { type: "set", id: "fallback", value: true },
      { type: "read", id: "computed" },
      { type: "set", id: "condition", value: true },
      { type: "flush" },
    ],
  },
];
