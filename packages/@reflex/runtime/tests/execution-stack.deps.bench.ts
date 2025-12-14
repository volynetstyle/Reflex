import { bench, describe } from "vitest";
import { ExecutionStack, execute } from "../src/execution/context.stack";

const ITER = 10_000_000;

describe("ExecutionStack – dependency checks", () => {
  bench("contains() hit", () => {
    const stack = new ExecutionStack(16);
    stack.push(1);
    stack.push(2);
    stack.push(3);

    for (let i = 0; i < ITER; i++) {
      stack.contains(1);
    }
  });

  bench("contains() miss", () => {
    const stack = new ExecutionStack(16);
    stack.push(1);
    stack.push(2);
    stack.push(3);

    for (let i = 0; i < ITER; i++) {
      stack.contains(999);
    }
  });

  bench("canDependOn() true", () => {
    const stack = new ExecutionStack(16);
    stack.push(1);
    stack.push(2);
    stack.push(3);

    for (let i = 0; i < ITER; i++) {
      stack.canDependOn(1);
    }
  });

  bench("canDependOn() false (self)", () => {
    const stack = new ExecutionStack(16);
    stack.push(1);
    stack.push(2);
    stack.push(3);

    for (let i = 0; i < ITER; i++) {
      stack.canDependOn(3);
    }
  });

  bench("enter/leave nested (depth = 4)", () => {
    const stack = new ExecutionStack(16);

    for (let i = 0; i < 5_000_000; i++) {
      stack.enter(0);
      stack.enter(1);
      stack.enter(2);
      stack.enter(3);

      stack.leave(3);
      stack.leave(2);
      stack.leave(1);
      stack.leave(0);
    }
  });
});
