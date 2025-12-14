import { bench, describe } from "vitest";
import { ExecutionStack, execute } from "../src/execution/context.stack";

const ITER = 2_000_000;

describe("ExecutionStack – reset / epoch", () => {
  bench("reset() after shallow stack", () => {
    const stack = new ExecutionStack(16);

    for (let i = 0; i < ITER; i++) {
      stack.push(1);
      stack.push(2);
      stack.pop();
      stack.pop();
      stack.reset();
    }
  });

  bench("push after many resets (epoch)", () => {
    const stack = new ExecutionStack(16);

    for (let i = 0; i < ITER; i++) {
      stack.reset();
      stack.push(1);
      stack.pop();
    }
  });
});
