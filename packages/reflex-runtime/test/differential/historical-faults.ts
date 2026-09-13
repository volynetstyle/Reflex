import type { Expr, Op } from "./harness";

export interface HistoricalFault {
  id: string;
  faultClass: string;
  fixedBy: string;
  discoveredBy: string;
  program: readonly Op[];
}

const read = (id: string): Expr => ({ type: "read", id });

export const historicalFaults: readonly HistoricalFault[] = [
  {
    id: "validation-history-dependence",
    faultClass: "exception atomicity / pull validation",
    fixedBy: "79dace5",
    discoveredBy: "stateful differential fuzzing",
    program: [
      { type: "signal", id: "p0", value: -Infinity },
      { type: "signal", id: "p1", value: -Infinity },
      { type: "signal", id: "p2", value: false },
      {
        type: "computed",
        id: "c0",
        expression: {
          type: "if",
          condition: read("p2"),
          then: {
            type: "add",
            left: read("p1"),
            right: { type: "throw", message: "generated failure" },
          },
          else: read("p0"),
        },
      },
      { type: "effect", id: "w0", expression: read("c0") },
      { type: "flush" },
      { type: "set", id: "p0", value: Infinity },
      { type: "read", id: "c0" },
      { type: "set", id: "p2", value: true },
      { type: "flush" },
      { type: "flush" },
    ],
  },
  {
    id: "lost-unknown-to-changed-promotion",
    faultClass: "invalidation lattice / state promotion",
    fixedBy: "79dace5",
    discoveredBy: "stateful differential fuzzing",
    program: [
      { type: "signal", id: "p0", value: -Infinity },
      { type: "signal", id: "p1", value: -Infinity },
      { type: "signal", id: "p2", value: -Infinity },
      {
        type: "computed",
        id: "c0",
        expression: { type: "add", left: read("p0"), right: read("p1") },
      },
      { type: "effect", id: "w0", expression: read("c0") },
      {
        type: "effect",
        id: "w1",
        expression: read("p2"),
        cleanup: read("p1"),
      },
      {
        type: "effect",
        id: "w2",
        expression: {
          type: "if",
          condition: read("p2"),
          then: read("c0"),
          else: read("p0"),
        },
      },
      { type: "flush" },
      { type: "set", id: "p0", value: 0 },
      { type: "set", id: "p2", value: false },
      { type: "flush" },
    ],
  },
  {
    id: "lost-watcher-invalidation-after-validation-recovery",
    faultClass: "watcher retry / cross-dependency invalidation",
    fixedBy: "pending cold-path recovery commit",
    discoveredBy: "causal action permutation differential exploration",
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
          then: { type: "throw", message: "dependency failure" },
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
