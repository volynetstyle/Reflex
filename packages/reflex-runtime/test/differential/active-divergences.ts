import type { Expr, Observation, Op } from "./harness";

export interface ActiveDivergence {
  id:
    | "cleanup-before-validation-completes"
    | "lost-watcher-invalidation-after-validation-recovery";
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
  {
    id: "lost-watcher-invalidation-after-validation-recovery",
    boundary: "watcher retry / cross-dependency invalidation",
    severity: "critical",
    consequence:
      "A recovered watcher misses a real dependency change and leaves its external state stale.",
    discoveredBy: "causal action permutation over dependency validation order",
    operationIndex: 11,
    expected: {
      effects: [{ effect: "watcher", phase: "run", value: false }],
    },
    actual: { effects: [] },
    program: [
      { type: "signal", id: "changeSource", value: false },
      { type: "signal", id: "failGate", value: false },
      {
        type: "computed",
        id: "changed",
        expression: read("changeSource"),
      },
      {
        type: "computed",
        id: "failing",
        expression: {
          type: "if",
          condition: read("failGate"),
          then: {
            type: "throw",
            message: "dependency failure",
          },
          else: { type: "constant", value: false },
        },
      },
      {
        type: "effect",
        id: "watcher",
        expression: {
          type: "equal",
          left: read("failing"),
          right: read("changed"),
        },
      },
      { type: "flush" },
      { type: "set", id: "failGate", value: true },
      { type: "set", id: "changeSource", value: true },
      { type: "read", id: "changed" },
      { type: "flush" },
      { type: "set", id: "failGate", value: false },
      { type: "flush" },
    ],
  },
];
