import { beforeEach, describe, expect, it } from "vitest";
import fc from "fast-check";
import { resetRuntimeContext } from "../../src";
import {
  executeDifferential,
  observationsEqual,
  type Expr,
  type Observation,
  type Op,
  type Value,
} from "./harness";

const constant = (value: Value): Expr => ({ type: "constant", value });
const read = (id: string): Expr => ({ type: "read", id });
const specialValue = fc.constantFrom<Value>(
  -Infinity,
  -3,
  -1,
  -0,
  0,
  1,
  3,
  Infinity,
  NaN,
  false,
  true,
  null,
);

describe("spec runtime differential oracle", () => {
  beforeEach(resetRuntimeContext);

  it("uses Object.is semantics instead of JSON equality", () => {
    const observation = (value: Value): Observation => ({ value, effects: [] });
    expect(observationsEqual(observation(NaN), observation(NaN))).toBe(true);
    expect(observationsEqual(observation(-0), observation(0))).toBe(false);
    expect(observationsEqual(observation(Infinity), observation(null))).toBe(
      false,
    );
  });

  it("matches dynamic dependency cleanup", () => {
    const branch: Expr = {
      type: "if",
      condition: { type: "greaterThan", left: read("a"), right: constant(0) },
      then: { type: "multiply", left: read("b"), right: constant(2) },
      else: constant(10),
    };
    const program: Op[] = [
      { type: "signal", id: "a", value: 1 },
      { type: "signal", id: "b", value: 2 },
      { type: "computed", id: "x", expression: branch },
      {
        type: "computed",
        id: "y",
        expression: { type: "add", left: read("x"), right: read("a") },
      },
      { type: "effect", id: "log", expression: read("y") },
      { type: "flush" },
      { type: "set", id: "b", value: 5 },
      { type: "flush" },
      { type: "set", id: "a", value: -1 },
      { type: "flush" },
      { type: "set", id: "b", value: 100 },
      { type: "flush" },
      { type: "set", id: "a", value: 2 },
      { type: "flush" },
    ];
    const values = executeDifferential(program)
      .flatMap((observation) => observation.effects)
      .map((event) => event.value);
    expect(values).toEqual([5, 11, 9, 202]);
  });

  it("shields downstream effects when a computed value does not change", () => {
    const program: Op[] = [
      { type: "signal", id: "a", value: 1 },
      {
        type: "computed",
        id: "positive",
        expression: {
          type: "greaterThan",
          left: read("a"),
          right: constant(0),
        },
      },
      { type: "effect", id: "sink", expression: read("positive") },
      { type: "flush" },
      { type: "set", id: "a", value: 2 },
      { type: "flush" },
      { type: "set", id: "a", value: 500 },
      { type: "flush" },
    ];
    const events = executeDifferential(program).flatMap((item) => item.effects);
    expect(events).toEqual([{ effect: "sink", phase: "run", value: true }]);
  });

  it("observes cleanup order, disposal, and untracked cleanup reads", () => {
    const result = executeDifferential([
      { type: "signal", id: "source", value: 1 },
      { type: "signal", id: "cleanupValue", value: 10 },
      {
        type: "effect",
        id: "effect",
        expression: read("source"),
        cleanup: read("cleanupValue"),
      },
      { type: "flush" },
      { type: "set", id: "cleanupValue", value: 20 },
      { type: "flush" },
      { type: "set", id: "source", value: 2 },
      { type: "flush" },
      { type: "dispose", id: "effect" },
    ]);
    expect(result[5]?.effects).toEqual([]);
    expect(result[7]?.effects).toEqual([
      { effect: "effect", phase: "cleanup", value: 20 },
      { effect: "effect", phase: "run", value: 2 },
    ]);
    expect(result[8]?.effects).toEqual([
      { effect: "effect", phase: "cleanup", value: 20 },
    ]);
  });

  it("retries a computed after an exception without committing a value", () => {
    executeDifferential([
      { type: "signal", id: "fail", value: true },
      { type: "signal", id: "source", value: 7 },
      {
        type: "computed",
        id: "value",
        expression: {
          type: "if",
          condition: read("fail"),
          then: { type: "throw", message: "boom" },
          else: read("source"),
        },
      },
      { type: "read", id: "value" },
      { type: "set", id: "fail", value: false },
      { type: "read", id: "value" },
    ]);
  });

  it("consumes cleanup and retries a watcher after an exception", () => {
    const result = executeDifferential([
      { type: "signal", id: "fail", value: false },
      { type: "signal", id: "source", value: 1 },
      {
        type: "effect",
        id: "effect",
        expression: {
          type: "if",
          condition: read("fail"),
          then: { type: "throw", message: "watcher failed" },
          else: read("source"),
        },
        cleanup: constant(99),
      },
      { type: "flush" },
      { type: "set", id: "fail", value: true },
      { type: "flush" },
      { type: "set", id: "fail", value: false },
      { type: "set", id: "source", value: 2 },
      { type: "flush" },
    ]);
    expect(result[5]?.error?.message).toBe("watcher failed");
    expect(result[5]?.effects).toEqual([
      { effect: "effect", phase: "cleanup", value: 99 },
    ]);
    expect(result[8]?.effects).toEqual([
      { effect: "effect", phase: "run", value: 2 },
    ]);
  });
  it("generates and shrinks arbitrary acyclic topologies", () => {
    fc.assert(
      fc.property(topologyArbitrary, (input) => {
        resetRuntimeContext();
        executeDifferential(buildProgram(input));
      }),
      { numRuns: 1_000 },
    );
  });
});

const topologyArbitrary = fc.record({
  producerValues: fc.array(specialValue, { minLength: 2, maxLength: 6 }),
  computedSeeds: fc.array(
    fc.record({
      kind: fc.integer({ min: 0, max: 5 }),
      left: fc.nat(),
      right: fc.nat(),
      gate: fc.nat(),
      value: specialValue,
    }),
    { minLength: 1, maxLength: 10 },
  ),
  watcherSeeds: fc.array(
    fc.record({ source: fc.nat(), cleanup: fc.boolean() }),
    { maxLength: 3 },
  ),
  steps: fc.array(
    fc.record({
      kind: fc.integer({ min: 0, max: 3 }),
      target: fc.nat(),
      value: specialValue,
    }),
    { minLength: 1, maxLength: 100 },
  ),
});

type TopologyInput =
  typeof topologyArbitrary extends fc.Arbitrary<infer T> ? T : never;

function buildProgram(input: TopologyInput): Op[] {
  const program: Op[] = input.producerValues.map((value, index) => ({
    type: "signal",
    id: `p${index}`,
    value,
  }));
  const readable = input.producerValues.map((_value, index) => `p${index}`);
  for (const [index, seed] of input.computedSeeds.entries()) {
    const pick = (value: number) => read(readable[value % readable.length]!);
    let expression: Expr;
    switch (seed.kind) {
      case 0:
        expression = pick(seed.left);
        break;
      case 1:
        expression = {
          type: "add",
          left: pick(seed.left),
          right: pick(seed.right),
        };
        break;
      case 2:
        expression = {
          type: "multiply",
          left: pick(seed.left),
          right: pick(seed.right),
        };
        break;
      case 3:
        expression = {
          type: "greaterThan",
          left: pick(seed.left),
          right: pick(seed.right),
        };
        break;
      case 4:
        expression = {
          type: "equal",
          left: pick(seed.left),
          right: pick(seed.right),
        };
        break;
      default:
        expression = {
          type: "if",
          condition: pick(seed.gate),
          then: pick(seed.left),
          else: constant(seed.value),
        };
    }
    const id = `c${index}`;
    program.push({ type: "computed", id, expression });
    readable.push(id);
  }
  const activeWatchers: string[] = [];
  for (const [index, seed] of input.watcherSeeds.entries()) {
    const id = `w${index}`;
    const source = readable[seed.source % readable.length]!;
    program.push({
      type: "effect",
      id,
      expression: read(source),
      ...(seed.cleanup
        ? { cleanup: read(input.producerValues.length > 0 ? "p0" : source) }
        : {}),
    });
    activeWatchers.push(id);
  }
  program.push({ type: "flush" });
  for (const step of input.steps) {
    if (step.kind === 0) {
      program.push({
        type: "set",
        id: `p${step.target % input.producerValues.length}`,
        value: step.value,
      });
    } else if (step.kind === 1) {
      program.push({
        type: "read",
        id: readable[step.target % readable.length]!,
      });
    } else if (step.kind === 2 || activeWatchers.length === 0) {
      program.push({ type: "flush" });
    } else {
      const watcherIndex = step.target % activeWatchers.length;
      program.push({ type: "dispose", id: activeWatchers[watcherIndex]! });
      activeWatchers.splice(watcherIndex, 1);
    }
  }
  return program;
}
