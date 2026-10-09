import { beforeEach, describe, it } from "vitest";
import fc from "fast-check";
import { resetRuntimeContext } from "../../src";
import { defineProgram, expr, op, type Op } from "./api";
import { executeDifferential } from "./harness";

const stepArbitrary = fc.record({
  kind: fc.constantFrom(
    "write",
    "pull",
    "link",
    "unlink",
    "fail",
    "flush",
    "batch",
    "nested-batch",
    "dispose-recreate",
  ),
  target: fc.constantFrom("source", "other"),
  value: fc.integer({ min: -3, max: 3 }),
});

type Step = typeof stepArbitrary extends fc.Arbitrary<infer T> ? T : never;

function programFor(steps: readonly Step[]): Op[] {
  const operations: Op[] = [
    op.signal("source", 0),
    op.signal("other", 10),
    op.signal("gate", true),
    op.signal("fail", false),
    op.computed(
      "branch",
      expr.when(expr.read("gate"), expr.read("source"), expr.read("other")),
    ),
    op.computed("nested", expr.add(expr.read("branch"), expr.read("source"))),
  ];
  const watcherExpression = expr.when(
    expr.read("fail"),
    expr.fail("generated watcher failure"),
    expr.read("nested"),
  );
  let watcherId = 0;
  let activeWatcher: string | undefined = "watcher0";
  operations.push(
    op.watcher(activeWatcher, watcherExpression, { cleanup: expr.value(1) }),
    op.flush(),
  );

  for (const step of steps) {
    switch (step.kind) {
      case "write":
        operations.push(op.set(step.target, step.value));
        break;
      case "pull":
        operations.push(op.read("nested"));
        break;
      case "link":
        operations.push(op.set("gate", true), op.read("branch"));
        break;
      case "unlink":
        operations.push(op.set("gate", false), op.read("branch"));
        break;
      case "fail":
        operations.push(op.set("fail", step.value % 2 === 0));
        break;
      case "flush":
        operations.push(op.flush());
        break;
      case "batch":
        operations.push(
          op.enterBatch(),
          op.set(step.target, step.value),
          op.read("nested"),
          op.set(step.target, step.value + 1),
          op.leaveBatch(),
          op.flush(),
        );
        break;
      case "nested-batch":
        operations.push(
          op.enterBatch(),
          op.set(step.target, step.value),
          op.enterBatch(),
          op.set("other", step.value + 10),
          op.flush(),
          op.leaveBatch(),
          op.leaveBatch(),
        );
        break;
      case "dispose-recreate":
        if (activeWatcher !== undefined) {
          operations.push(op.dispose(activeWatcher));
          activeWatcher = undefined;
        } else {
          activeWatcher = `watcher${++watcherId}`;
          operations.push(
            op.watcher(activeWatcher, watcherExpression, {
              cleanup: expr.value(1),
            }),
          );
        }
        break;
    }
  }
  operations.push(op.set("fail", false), op.flush(), op.read("nested"));
  return operations;
}

describe("RULES state-space differential programs", () => {
  beforeEach(resetRuntimeContext);

  it("covers the causal boundary prefixes explicitly", () => {
    for (const steps of [
      [
        { kind: "write", target: "source", value: 1 },
        { kind: "pull", target: "source", value: 0 },
        { kind: "write", target: "source", value: 2 },
      ],
      [
        { kind: "unlink", target: "source", value: 0 },
        { kind: "write", target: "source", value: 1 },
        { kind: "link", target: "source", value: 0 },
        { kind: "write", target: "source", value: 2 },
      ],
      [
        { kind: "write", target: "source", value: 1 },
        { kind: "unlink", target: "source", value: 0 },
        { kind: "write", target: "source", value: 2 },
      ],
      [
        { kind: "fail", target: "source", value: 2 },
        { kind: "flush", target: "source", value: 0 },
        { kind: "dispose-recreate", target: "source", value: 0 },
        { kind: "dispose-recreate", target: "source", value: 0 },
        { kind: "batch", target: "source", value: 3 },
      ],
    ] as const) {
      executeDifferential(
        defineProgram(
          `rules/${steps.map((step) => step.kind).join("-")}`,
          programFor(steps),
        ).operations,
      );
    }
  });

  it("generates and shrinks mixed write/read/link/dispose/batch traces", () => {
    fc.assert(
      fc.property(
        fc.array(stepArbitrary, { minLength: 1, maxLength: 25 }),
        (steps) => {
          resetRuntimeContext();
          executeDifferential(programFor(steps));
        },
      ),
      { seed: 0x5eed3037, numRuns: 1_000 },
    );
  });
});
