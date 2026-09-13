import { describe, it } from "vitest";
import fc from "fast-check";
import { resetRuntimeContext } from "../../src";
import { executeDifferential, type Expr, type Op, type Value } from "./harness";

const read = (id: string): Expr => ({ type: "read", id });
const constant = (value: Value): Expr => ({ type: "constant", value });
const valueArbitrary = fc.constantFrom<Value>(
  -Infinity,
  -3,
  -1,
  -0,
  0,
  1,
  2,
  3,
  100,
  Infinity,
  NaN,
  false,
  true,
  null,
);
const familyArbitrary = fc.constantFrom(
  "diamond",
  "dynamic-branch",
  "value-shielding",
  "cleanup-dependency",
  "failing-branch",
  "multi-level",
  "multiple-watchers",
);

const scenarioArbitrary = fc.record({
  family: familyArbitrary,
  initial: fc.tuple(valueArbitrary, valueArbitrary, valueArbitrary),
  depth: fc.integer({ min: 2, max: 7 }),
  steps: fc.array(
    fc.record({
      kind: fc.integer({ min: 0, max: 5 }),
      target: fc.nat(),
      value: valueArbitrary,
      cleanup: fc.boolean(),
    }),
    { minLength: 1, maxLength: 120 },
  ),
});

type Scenario =
  typeof scenarioArbitrary extends fc.Arbitrary<infer T> ? T : never;
type World = {
  program: Op[];
  producers: string[];
  readable: string[];
  activeWatchers: string[];
  nextWatcher: number;
};

describe("state-aware differential program generation", () => {
  it("targets high-value graph families while emitting only valid operations", () => {
    fc.assert(
      fc.property(scenarioArbitrary, (scenario) => {
        resetRuntimeContext();
        executeDifferential(buildScenario(scenario));
      }),
      { numRuns: 2_000 },
    );
  });

  it("preserves cache transparency after failed validation", () => {
    executeDifferential(knownValidationZombieCounterexample());
  });
  it("promotes a transitively dirty watcher after direct invalidation", () => {
    executeDifferential(knownBatchedBranchCounterexample());
  });
});

function knownValidationZombieCounterexample(): Op[] {
  const failingBranch: Expr = {
    type: "add",
    left: read("p1"),
    right: { type: "throw", message: "generated failure" },
  };
  return [
    { type: "signal", id: "p0", value: -Infinity },
    { type: "signal", id: "p1", value: -Infinity },
    { type: "signal", id: "p2", value: false },
    {
      type: "computed",
      id: "c0",
      expression: {
        type: "if",
        condition: read("p2"),
        then: failingBranch,
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
  ];
}
function knownBatchedBranchCounterexample(): Op[] {
  return [
    { type: "signal", id: "p0", value: -Infinity },
    { type: "signal", id: "p1", value: -Infinity },
    { type: "signal", id: "p2", value: -Infinity },
    {
      type: "computed",
      id: "c0",
      expression: { type: "add", left: read("p0"), right: read("p1") },
    },
    { type: "effect", id: "w0", expression: read("c0") },
    { type: "effect", id: "w1", expression: read("p2"), cleanup: read("p1") },
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
  ];
}

function buildScenario(scenario: Scenario): Op[] {
  const initial = [...scenario.initial];
  if (scenario.family === "failing-branch") initial[2] = false;
  const world: World = {
    program: initial.map((value, index) => ({
      type: "signal",
      id: `p${index}`,
      value,
    })),
    producers: ["p0", "p1", "p2"],
    readable: ["p0", "p1", "p2"],
    activeWatchers: [],
    nextWatcher: 0,
  };

  addTopology(world, scenario);
  world.program.push({ type: "flush" });

  for (const step of scenario.steps) {
    switch (step.kind) {
      case 0:
        world.program.push({
          type: "set",
          id: world.producers[step.target % world.producers.length]!,
          value: step.value,
        });
        break;
      case 1:
        world.program.push({
          type: "read",
          id: world.readable[step.target % world.readable.length]!,
        });
        break;
      case 2:
        world.program.push({ type: "flush" });
        break;
      case 3:
        if (world.activeWatchers.length === 0) {
          world.program.push({ type: "flush" });
          break;
        }
        disposeWatcher(world, step.target);
        break;
      case 4:
        world.program.push(
          {
            type: "set",
            id: world.producers[step.target % world.producers.length]!,
            value: step.value,
          },
          { type: "flush" },
        );
        break;
      default:
        addWatcher(
          world,
          read(world.readable[step.target % world.readable.length]!),
          step.cleanup ? read("p1") : undefined,
        );
        world.program.push({ type: "flush" });
    }
  }
  return world.program;
}

function addTopology(world: World, scenario: Scenario): void {
  switch (scenario.family) {
    case "diamond": {
      const shared = addComputed(world, {
        type: "add",
        left: read("p0"),
        right: read("p1"),
      });
      const left = addComputed(world, {
        type: "multiply",
        left: read(shared),
        right: read("p2"),
      });
      const right = addComputed(world, {
        type: "add",
        left: read(shared),
        right: constant(1),
      });
      addWatcher(
        world,
        read(
          addComputed(world, {
            type: "add",
            left: read(left),
            right: read(right),
          }),
        ),
      );
      break;
    }
    case "dynamic-branch": {
      const branch = addComputed(world, {
        type: "if",
        condition: read("p2"),
        then: read("p0"),
        else: read("p1"),
      });
      addWatcher(world, read(branch));
      addWatcher(
        world,
        read(
          addComputed(world, {
            type: "add",
            left: read(branch),
            right: read("p0"),
          }),
        ),
      );
      break;
    }
    case "value-shielding": {
      let node = addComputed(world, {
        type: "greaterThan",
        left: read("p0"),
        right: constant(0),
      });
      for (let index = 1; index < scenario.depth; index += 1) {
        node = addComputed(world, {
          type: "if",
          condition: read(node),
          then: constant(1),
          else: constant(0),
        });
      }
      addWatcher(world, read(node));
      break;
    }
    case "cleanup-dependency":
      addWatcher(world, read("p0"), read("p1"));
      break;
    case "failing-branch": {
      const partialThenThrow: Expr = {
        type: "add",
        left: read("p1"),
        right: { type: "throw", message: "generated failure" },
      };
      const failing = addComputed(world, {
        type: "if",
        condition: read("p2"),
        then: partialThenThrow,
        else: read("p0"),
      });
      addWatcher(world, read(failing));
      break;
    }
    case "multi-level": {
      let node = "p0";
      for (let index = 0; index < scenario.depth; index += 1) {
        node = addComputed(world, {
          type: index % 2 === 0 ? "add" : "multiply",
          left: read(node),
          right: read(index % 3 === 0 ? "p1" : "p2"),
        });
      }
      addWatcher(world, read(node));
      break;
    }
    case "multiple-watchers": {
      const shared = addComputed(world, {
        type: "add",
        left: read("p0"),
        right: read("p1"),
      });
      addWatcher(world, read(shared));
      addWatcher(world, read("p2"), read("p1"));
      addWatcher(world, {
        type: "if",
        condition: read("p2"),
        then: read(shared),
        else: read("p0"),
      });
      break;
    }
  }
}

function addComputed(world: World, expression: Expr): string {
  const id = `c${world.readable.length - world.producers.length}`;
  world.program.push({ type: "computed", id, expression });
  world.readable.push(id);
  return id;
}

function addWatcher(world: World, expression: Expr, cleanup?: Expr): void {
  const id = `w${world.nextWatcher}`;
  world.nextWatcher += 1;
  world.program.push({
    type: "effect",
    id,
    expression,
    ...(cleanup === undefined ? {} : { cleanup }),
  });
  world.activeWatchers.push(id);
}

function disposeWatcher(world: World, target: number): void {
  const index = target % world.activeWatchers.length;
  world.program.push({ type: "dispose", id: world.activeWatchers[index]! });
  world.activeWatchers.splice(index, 1);
}
