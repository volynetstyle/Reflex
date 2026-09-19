import type { Expr, Op } from "../harness";
import type { QualificationProgram } from "./mutation-qualification";

const read = (id: string): Expr => ({ type: "read", id });
const fail = (message: string): Expr => ({ type: "throw", message });
const add = (left: Expr, right: Expr): Expr => ({ type: "add", left, right });
const branch = (condition: string, whenTrue: Expr, whenFalse: Expr): Expr => ({
  type: "if",
  condition: read(condition),
  then: whenTrue,
  else: whenFalse,
});

function failingComputedSetup(): Op[] {
  return [
    { type: "signal", id: "gate", value: false },
    { type: "signal", id: "stable", value: 0 },
    { type: "signal", id: "partial", value: 1 },
    {
      type: "computed",
      id: "computed",
      expression: branch(
        "gate",
        add(read("partial"), fail("computed failure")),
        read("stable"),
      ),
    },
  ];
}

function failingWatcherSetup(): Op[] {
  return [
    { type: "signal", id: "gate", value: false },
    { type: "signal", id: "stable", value: 0 },
    { type: "signal", id: "partial", value: 1 },
    {
      type: "effect",
      id: "watcher",
      expression: branch(
        "gate",
        add(read("partial"), fail("watcher failure")),
        read("stable"),
      ),
    },
    { type: "flush" },
    { type: "set", id: "gate", value: true },
    { type: "flush" },
  ];
}

export const mutationQualificationCorpus: readonly QualificationProgram[] = [
  {
    name: "producer Object.is semantics",
    program: [
      { type: "signal", id: "value", value: NaN },
      { type: "effect", id: "watcher", expression: read("value") },
      { type: "flush" },
      { type: "set", id: "value", value: NaN },
      { type: "flush" },
    ],
  },
  {
    name: "computed Object.is semantics",
    program: [
      { type: "signal", id: "value", value: -0 },
      { type: "computed", id: "computed", expression: read("value") },
      { type: "effect", id: "watcher", expression: read("computed") },
      { type: "flush" },
      { type: "set", id: "value", value: 0 },
      { type: "flush" },
    ],
  },
  {
    name: "computed failure remains transactional",
    program: [
      ...failingComputedSetup(),
      { type: "read", id: "computed" },
      { type: "set", id: "gate", value: true },
      { type: "read", id: "computed" },
      { type: "read", id: "computed" },
    ],
  },
  {
    name: "cleanup reads stay untracked",
    program: [
      { type: "signal", id: "trigger", value: 0 },
      { type: "signal", id: "incidental", value: 0 },
      {
        type: "effect",
        id: "watcher",
        expression: read("trigger"),
        cleanup: read("incidental"),
      },
      { type: "flush" },
      { type: "set", id: "trigger", value: 1 },
      { type: "flush" },
      { type: "set", id: "incidental", value: 1 },
      { type: "flush" },
    ],
  },
  {
    name: "watcher failure preserves committed dependencies",
    program: [
      ...failingWatcherSetup(),
      { type: "set", id: "stable", value: 2 },
      { type: "flush" },
    ],
  },
  {
    name: "watcher failure waits for a retry trigger",
    program: [...failingWatcherSetup(), { type: "flush" }],
  },
  {
    name: "validation failure stays pending",
    program: [
      ...failingComputedSetup(),
      { type: "effect", id: "watcher", expression: read("computed") },
      { type: "flush" },
      { type: "set", id: "gate", value: true },
      { type: "flush" },
      { type: "flush" },
    ],
  },
  {
    name: "throwing cleanup is consumed",
    program: [
      { type: "signal", id: "trigger", value: 0 },
      {
        type: "effect",
        id: "watcher",
        expression: read("trigger"),
        cleanup: fail("cleanup failure"),
      },
      { type: "flush" },
      { type: "set", id: "trigger", value: 1 },
      { type: "flush" },
      { type: "set", id: "trigger", value: 2 },
      { type: "flush" },
    ],
  },
  {
    name: "watcher validates the full committed frontier",
    program: [
      { type: "signal", id: "direct", value: 0 },
      { type: "signal", id: "failGate", value: false },
      {
        type: "computed",
        id: "failing",
        expression: branch("failGate", fail("validation failure"), {
          type: "constant",
          value: 0,
        }),
      },
      {
        type: "effect",
        id: "watcher",
        expression: add(read("direct"), read("failing")),
        cleanup: { type: "constant", value: "cleanup" },
      },
      { type: "flush" },
      { type: "set", id: "direct", value: 1 },
      { type: "set", id: "failGate", value: true },
      { type: "flush" },
    ],
  },
];
