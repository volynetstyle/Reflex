import { describe, expect, it } from "vitest";
import { resetRuntimeContext } from "../../src";
import {
  DifferentialError,
  executeDifferential,
  type Expr,
  type Observation,
  type Op,
} from "./harness";

interface Finding {
  family: string;
  operationIndex: number;
  operation: Op;
  expected: Observation;
  actual: Observation;
  prefix: readonly Op[];
}

describe("adversarial differential classification", () => {
  it("classifies divergences across causal action permutations", () => {
    const programs = adversarialPrograms();
    const findings: Finding[] = [];

    for (const candidate of programs) {
      resetRuntimeContext();
      try {
        executeDifferential(candidate.program);
      } catch (error) {
        if (!(error instanceof DifferentialError)) throw error;
        findings.push({
          family: candidate.family,
          operationIndex: error.operationIndex,
          operation: error.operation,
          expected: error.expected,
          actual: error.actual,
          prefix: error.prefix,
        });
      }
    }

    const counts: Record<string, number> = {};
    const unclassified: Finding[] = [];
    for (const finding of findings) {
      const classification = classifyFinding(finding);
      if (classification === undefined) {
        unclassified.push(finding);
      } else {
        counts[classification] = (counts[classification] ?? 0) + 1;
      }
    }

    expect({
      programs: programs.length,
      findings: findings.length,
      counts,
      unclassified,
    }).toEqual({
      programs: 776,
      findings: 0,
      counts: {},
      unclassified: [],
    });
  });
});

function classifyFinding(finding: Finding): string | undefined {
  const expectedError = finding.expected.error;
  const actualError = finding.actual.error;
  const sameError =
    expectedError !== undefined &&
    actualError !== undefined &&
    expectedError.name === actualError.name &&
    expectedError.message === actualError.message;
  const actualCleanupOnly =
    finding.expected.effects.length === 0 &&
    finding.actual.effects.length !== 0 &&
    finding.actual.effects.every((event) => event.phase === "cleanup");

  if (sameError && actualCleanupOnly) {
    return "cleanup-before-validation-completes";
  }

  const expectedRun = finding.expected.effects.some(
    (event) => event.phase === "run",
  );

  if (
    expectedError === undefined &&
    actualError === undefined &&
    expectedRun &&
    finding.actual.effects.length === 0
  ) {
    return "lost-watcher-invalidation-after-validation-recovery";
  }

  if (
    finding.family.startsWith("watcher-evidence-merge/") &&
    sameError &&
    actualCleanupOnly
  ) {
    return "watcher-validation-obligation-lost-after-direct-change";
  }

  return undefined;
}
function adversarialPrograms(): Array<{
  family: string;
  program: readonly Op[];
}> {
  return [
    ...dualFailureOrderPrograms(),
    ...throwingDisposePrograms(),
    ...computedDependencyOrderPrograms(),
    ...dependencyOrderPrograms(),
    ...nestedFailurePrograms(),
    ...siblingWatcherPrograms(),
    ...throwingCleanupPrograms(),
    ...mixedDirectDerivedWriteOrderPrograms(),
    ...mixedThreeDependencyPrograms(),
  ];
}

function expressionForReadOrder(ids: readonly string[]): Expr {
  if (ids.length === 0) {
    return { type: "constant", value: 0 };
  }

  let expression: Expr = read(ids[0]!);

  for (let index = 1; index < ids.length; index += 1) {
    expression = {
      type: "add",
      left: expression,
      right: read(ids[index]!),
    };
  }

  return expression;
}

function mixedThreeDependencyPrograms(): Array<{
  family: string;
  program: readonly Op[];
}> {
  const programs: Array<{
    family: string;
    program: readonly Op[];
  }> = [];

  const readOrders = permutations(["direct", "stableDerived", "failing"]);

  const writes: Record<string, Op> = {
    direct: {
      type: "set",
      id: "direct",
      value: 1,
    },

    stable: {
      type: "set",
      id: "stableSource",
      value: 1,
    },

    failing: {
      type: "set",
      id: "failGate",
      value: true,
    },
  };

  for (const readOrder of readOrders) {
    for (const writeOrder of permutations(["direct", "stable", "failing"])) {
      programs.push({
        family:
          "watcher-evidence-frontier/" +
          "read-" +
          readOrder.join("-") +
          "/write-" +
          writeOrder.join("-"),

        program: [
          { type: "signal", id: "direct", value: 0 },
          { type: "signal", id: "stableSource", value: 0 },
          { type: "signal", id: "failGate", value: false },

          {
            type: "computed",
            id: "stableDerived",
            expression: {
              type: "multiply",
              left: read("stableSource"),
              right: {
                type: "constant",
                value: 0,
              },
            },
          },

          {
            type: "computed",
            id: "failing",
            expression: {
              type: "if",
              condition: read("failGate"),
              then: {
                type: "throw",
                message: "validation failure",
              },
              else: {
                type: "constant",
                value: 0,
              },
            },
          },

          {
            type: "effect",
            id: "watcher",
            expression: expressionForReadOrder(readOrder),
            cleanup: {
              type: "constant",
              value: "cleanup",
            },
          },

          { type: "flush" },

          ...writeOrder.map((id) => writes[id]!),

          { type: "flush" },
        ],
      });
    }
  }

  return programs;
}

function mixedDirectDerivedWriteOrderPrograms(): Array<{
  family: string;
  program: readonly Op[];
}> {
  const programs: Array<{
    family: string;
    program: readonly Op[];
  }> = [];

  const direct = read("direct");
  const failing = read("failing");

  for (const directReadFirst of [true, false]) {
    for (const directWriteFirst of [true, false]) {
      const left = directReadFirst ? direct : failing;
      const right = directReadFirst ? failing : direct;

      const writes: Op[] = directWriteFirst
        ? [
            { type: "set", id: "direct", value: 1 },
            { type: "set", id: "failGate", value: true },
          ]
        : [
            { type: "set", id: "failGate", value: true },
            { type: "set", id: "direct", value: 1 },
          ];

      programs.push({
        family:
          "watcher-evidence-merge/" +
          (directReadFirst ? "read-direct-first/" : "read-derived-first/") +
          (directWriteFirst ? "write-direct-first" : "write-derived-first"),

        program: [
          { type: "signal", id: "direct", value: 0 },
          { type: "signal", id: "failGate", value: false },

          {
            type: "computed",
            id: "failing",
            expression: {
              type: "if",
              condition: read("failGate"),
              then: {
                type: "throw",
                message: "validation failure",
              },
              else: {
                type: "constant",
                value: 0,
              },
            },
          },

          {
            type: "effect",
            id: "watcher",
            expression: {
              type: "add",
              left,
              right,
            },
            cleanup: {
              type: "constant",
              value: "cleanup",
            },
          },

          { type: "flush" },

          ...writes,

          { type: "flush" },
        ],
      });
    }
  }

  return programs;
}

function dualFailureOrderPrograms(): Array<{
  family: string;
  program: readonly Op[];
}> {
  const programs: Array<{ family: string; program: readonly Op[] }> = [];

  for (const aFirst of [false, true]) {
    for (const observer of ["computed", "watcher"] as const) {
      for (const gateOrdering of [
        ["aGate", "bGate"],
        ["bGate", "aGate"],
      ] as const) {
        const left = read(aFirst ? "a" : "b");
        const right = read(aFirst ? "b" : "a");
        const setup: Op[] = [
          { type: "signal", id: "aGate", value: false },
          { type: "signal", id: "bGate", value: false },
          {
            type: "computed",
            id: "a",
            expression: {
              type: "if",
              condition: read("aGate"),
              then: { type: "throw", message: "failure A" },
              else: { type: "constant", value: false },
            },
          },
          {
            type: "computed",
            id: "b",
            expression: {
              type: "if",
              condition: read("bGate"),
              then: { type: "throw", message: "failure B" },
              else: { type: "constant", value: false },
            },
          },
        ];
        const expression: Expr = { type: "equal", left, right };
        const observerSetup: Op[] =
          observer === "computed"
            ? [
                { type: "computed", id: "observer", expression },
                { type: "read", id: "observer" },
              ]
            : [
                {
                  type: "effect",
                  id: "observer",
                  expression,
                  cleanup: { type: "constant", value: "cleanup" },
                },
                { type: "flush" },
              ];

        programs.push({
          family: "dual-failure-" + observer,
          program: [
            ...setup,
            ...observerSetup,
            { type: "set", id: gateOrdering[0], value: true },
            { type: "set", id: gateOrdering[1], value: true },
            {
              type: observer === "computed" ? "read" : "flush",
              id: "observer",
            } as Op,
          ],
        });
      }
    }
  }

  return programs;
}
function throwingDisposePrograms(): Array<{
  family: string;
  program: readonly Op[];
}> {
  const programs: Array<{ family: string; program: readonly Op[] }> = [];

  for (const withSibling of [false, true]) {
    for (const ordering of permutations<Op>([
      { type: "dispose", id: "watcher" },
      { type: "set", id: "source", value: true },
      { type: "flush" },
    ])) {
      programs.push({
        family: "throwing-dispose",
        program: [
          { type: "signal", id: "source", value: false },
          {
            type: "effect",
            id: "watcher",
            expression: read("source"),
            cleanup: { type: "throw", message: "dispose cleanup failure" },
          },
          ...(withSibling
            ? ([
                {
                  type: "effect",
                  id: "sibling",
                  expression: read("source"),
                  cleanup: read("source"),
                },
              ] as Op[])
            : []),
          { type: "flush" },
          ...ordering,
          { type: "flush" },
        ],
      });
    }
  }

  return programs;
}
function computedDependencyOrderPrograms(): Array<{
  family: string;
  program: readonly Op[];
}> {
  const programs: Array<{ family: string; program: readonly Op[] }> = [];

  for (const changedFirst of [false, true]) {
    const changed = read("changed");
    const failing = read("failing");
    const setup: Op[] = [
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
          then: { type: "throw", message: "computed dependency failure" },
          else: { type: "constant", value: false },
        },
      },
      {
        type: "computed",
        id: "outer",
        expression: {
          type: "equal",
          left: changedFirst ? changed : failing,
          right: changedFirst ? failing : changed,
        },
      },
      { type: "read", id: "outer" },
    ];
    const causal: Op[] = [
      { type: "set", id: "changeSource", value: true },
      { type: "read", id: "changed" },
      { type: "set", id: "failGate", value: true },
      { type: "read", id: "outer" },
    ];

    for (const ordering of permutations(causal)) {
      programs.push({
        family: changedFirst
          ? "computed-order-changed-first"
          : "computed-order-failing-first",
        program: [
          ...setup,
          ...ordering,
          { type: "set", id: "failGate", value: false },
          { type: "read", id: "outer" },
        ],
      });
    }
  }

  return programs;
}
function dependencyOrderPrograms(): Array<{
  family: string;
  program: readonly Op[];
}> {
  const programs: Array<{ family: string; program: readonly Op[] }> = [];

  for (const changedFirst of [false, true]) {
    for (const cleanup of [false, true]) {
      const changed = read("changed");
      const failing = read("failing");
      const setup: Op[] = [
        { type: "signal", id: "changeSource", value: false },
        { type: "signal", id: "failGate", value: false },
        { type: "signal", id: "stable", value: false },
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
            else: read("stable"),
          },
        },
        {
          type: "effect",
          id: "watcher",
          expression: {
            type: "equal",
            left: changedFirst ? changed : failing,
            right: changedFirst ? failing : changed,
          },
          ...(cleanup ? { cleanup: read("stable") } : {}),
        },
        { type: "flush" },
      ];
      const causal: Op[] = [
        { type: "set", id: "changeSource", value: true },
        { type: "read", id: "changed" },
        { type: "set", id: "failGate", value: true },
        { type: "flush" },
      ];

      for (const ordering of permutations(causal)) {
        programs.push({
          family: changedFirst
            ? "dependency-order-changed-first"
            : "dependency-order-failing-first",
          program: [
            ...setup,
            ...ordering,
            { type: "set", id: "failGate", value: false },
            { type: "flush" },
          ],
        });
      }
    }
  }

  return programs;
}
function nestedFailurePrograms(): Array<{
  family: string;
  program: readonly Op[];
}> {
  const programs: Array<{ family: string; program: readonly Op[] }> = [];

  for (const initial of [false, true]) {
    for (const wrapper of ["read", "equal", "shield", "dynamic"] as const) {
      for (const cleanup of [undefined, "gate", "source"] as const) {
        const outer = outerExpression(wrapper);
        const setup: Op[] = [
          { type: "signal", id: "gate", value: false },
          { type: "signal", id: "source", value: initial },
          { type: "signal", id: "aux", value: !initial },
          {
            type: "computed",
            id: "inner",
            expression: {
              type: "if",
              condition: read("gate"),
              then: { type: "throw", message: "inner failure" },
              else: read("source"),
            },
          },
          { type: "computed", id: "outer", expression: outer },
          {
            type: "effect",
            id: "watcher",
            expression: read("outer"),
            ...(cleanup === undefined ? {} : { cleanup: read(cleanup) }),
          },
          { type: "flush" },
        ];
        const causal: Op[] = [
          { type: "set", id: "source", value: !initial },
          { type: "read", id: "inner" },
          { type: "set", id: "gate", value: true },
          { type: "flush" },
        ];

        for (const ordering of permutations(causal)) {
          programs.push({
            family: "nested-" + wrapper,
            program: [
              ...setup,
              ...ordering,
              { type: "set", id: "gate", value: false },
              { type: "flush" },
              { type: "read", id: "outer" },
            ],
          });
        }
      }
    }
  }

  return programs;
}

function siblingWatcherPrograms(): Array<{
  family: string;
  program: readonly Op[];
}> {
  const programs: Array<{ family: string; program: readonly Op[] }> = [];

  for (const failingFirst of [false, true]) {
    for (const cleanup of [false, true]) {
      const failing: Op = {
        type: "effect",
        id: "failing",
        expression: {
          type: "if",
          condition: read("fail"),
          then: { type: "throw", message: "watcher failure" },
          else: read("source"),
        },
        ...(cleanup ? { cleanup: read("incidental") } : {}),
      };
      const sibling: Op = {
        type: "effect",
        id: "sibling",
        expression: read("source"),
        cleanup: read("incidental"),
      };
      const setup: Op[] = [
        { type: "signal", id: "fail", value: false },
        { type: "signal", id: "source", value: false },
        { type: "signal", id: "incidental", value: false },
        ...(failingFirst ? [failing, sibling] : [sibling, failing]),
        { type: "flush" },
      ];
      const causal: Op[] = [
        { type: "set", id: "source", value: true },
        { type: "set", id: "fail", value: true },
        { type: "flush" },
      ];

      for (const ordering of permutations(causal)) {
        programs.push({
          family: "sibling-watchers",
          program: [
            ...setup,
            ...ordering,
            { type: "set", id: "fail", value: false },
            { type: "flush" },
          ],
        });
      }
    }
  }

  return programs;
}

function throwingCleanupPrograms(): Array<{
  family: string;
  program: readonly Op[];
}> {
  const programs: Array<{ family: string; program: readonly Op[] }> = [];

  for (const disposeAfterFailure of [false, true]) {
    const setup: Op[] = [
      { type: "signal", id: "trigger", value: false },
      { type: "signal", id: "cleanupFail", value: false },
      { type: "signal", id: "source", value: false },
      {
        type: "effect",
        id: "watcher",
        expression: {
          type: "if",
          condition: read("trigger"),
          then: read("source"),
          else: read("source"),
        },
        cleanup: {
          type: "if",
          condition: read("cleanupFail"),
          then: { type: "throw", message: "cleanup failure" },
          else: read("source"),
        },
      },
      { type: "flush" },
    ];
    const causal: Op[] = [
      { type: "set", id: "trigger", value: true },
      { type: "set", id: "cleanupFail", value: true },
      { type: "flush" },
    ];

    for (const ordering of permutations(causal)) {
      programs.push({
        family: "throwing-cleanup",
        program: [
          ...setup,
          ...ordering,
          { type: "set", id: "cleanupFail", value: false },
          ...(disposeAfterFailure
            ? [{ type: "dispose", id: "watcher" } as Op]
            : [
                { type: "set", id: "trigger", value: false } as Op,
                { type: "flush" } as Op,
              ]),
        ],
      });
    }
  }

  return programs;
}

function outerExpression(
  wrapper: "read" | "equal" | "shield" | "dynamic",
): Expr {
  switch (wrapper) {
    case "read":
      return read("inner");
    case "equal":
      return {
        type: "equal",
        left: read("inner"),
        right: { type: "constant", value: true },
      };
    case "shield":
      return {
        type: "if",
        condition: read("inner"),
        then: { type: "constant", value: 1 },
        else: { type: "constant", value: 1 },
      };
    case "dynamic":
      return {
        type: "if",
        condition: read("inner"),
        then: read("aux"),
        else: read("source"),
      };
  }
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length === 0) return [[]];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map(
      (suffix) => [item, ...suffix],
    ),
  );
}

function read(id: string): Expr {
  return { type: "read", id };
}
