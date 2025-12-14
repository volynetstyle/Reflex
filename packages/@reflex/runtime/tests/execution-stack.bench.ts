import { bench, describe } from "vitest";
import { ExecutionStack, execute } from "../src/execution/context.stack";

const ITER = 5_000_000;
const DEPTH = 4;

// Pre-generate node ids (no allocation during bench)
const NODES = Array.from({ length: DEPTH }, (_, i) => i);

describe("ExecutionStack – hot path", () => {
  bench("push + pop (flat)", () => {
    const stack = new ExecutionStack(16);

    for (let i = 0; i < ITER; i++) {
      stack.push(0);
      stack.pop();
    }
  });

  bench("manual nested push/pop", () => {
    const stack = new ExecutionStack(16);

    for (let i = 0; i < ITER; i++) {
      stack.push(0);
      stack.push(1);
      stack.push(2);
      stack.push(3);

      stack.pop();
      stack.pop();
      stack.pop();
      stack.pop();
    }
  });

  bench("withNode nested (depth = 4)", () => {
    const stack = new ExecutionStack(16);

    for (let i = 0; i < ITER; i++) {
      stack.withNode(0, () => {
        stack.withNode(1, () => {
          stack.withNode(2, () => {
            stack.withNode(3, () => {
              // minimal payload
            });
          });
        });
      });
    }
  });

  bench("execute() wrapper (withNode path)", () => {
    const stack = new ExecutionStack(16);

    for (let i = 0; i < ITER; i++) {
      execute(stack, 0, () => {
        execute(stack, 1, () => {
          execute(stack, 2, () => {
            execute(stack, 3, () => {});
          });
        });
      });
    }
  });
});
