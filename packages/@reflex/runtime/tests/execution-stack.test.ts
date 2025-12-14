import { describe, it, expect } from "vitest";
import { ExecutionStack } from "../src/execution/context.stack";

type NodeId = number;

describe("ExecutionStack – core invariants", () => {
  it("starts empty", () => {
    const stack = new ExecutionStack();
    expect(stack.depth()).toBe(0);
    expect(stack.current()).toBeNull();
  });

  it("push/pop maintains current and depth", () => {
    const stack = new ExecutionStack();

    stack.push(1);
    expect(stack.current()).toBe(1);
    expect(stack.depth()).toBe(1);

    stack.push(2);
    expect(stack.current()).toBe(2);
    expect(stack.depth()).toBe(2);

    const popped2 = stack.pop();
    expect(popped2).toBe(2);
    expect(stack.current()).toBe(1);
    expect(stack.depth()).toBe(1);

    const popped1 = stack.pop();
    expect(popped1).toBe(1);
    expect(stack.current()).toBeNull();
    expect(stack.depth()).toBe(0);
  });

  it("throws on pop underflow", () => {
    const stack = new ExecutionStack();
    expect(() => stack.pop()).toThrow("ExecutionStack underflow");
  });

  it("detects execution cycles", () => {
    const stack = new ExecutionStack();

    stack.push(1);
    stack.push(2);

    expect(() => stack.push(1)).toThrow("Execution cycle detected");
    expect(() => stack.push(2)).toThrow("Execution cycle detected");
  });

  it("contains() reflects membership accurately", () => {
    const stack = new ExecutionStack();

    stack.push(10);
    expect(stack.contains(10)).toBe(true);
    expect(stack.contains(11)).toBe(false);

    stack.push(20);
    expect(stack.contains(10)).toBe(true);
    expect(stack.contains(20)).toBe(true);

    stack.pop();
    expect(stack.contains(20)).toBe(false);
    expect(stack.contains(10)).toBe(true);

    stack.pop();
    expect(stack.contains(10)).toBe(false);
  });
});

describe("ExecutionStack – dependency rules (Axiom A4)", () => {
  it("allows dependency only on nodes strictly below current", () => {
    const stack = new ExecutionStack();

    stack.push(1);
    expect(stack.canDependOn(1)).toBe(false);

    stack.push(2);
    expect(stack.canDependOn(1)).toBe(true);
    expect(stack.canDependOn(2)).toBe(false);

    stack.push(3);
    expect(stack.canDependOn(1)).toBe(true);
    expect(stack.canDependOn(2)).toBe(true);
    expect(stack.canDependOn(3)).toBe(false);
  });

  it("rejects dependency on nodes not in stack", () => {
    const stack = new ExecutionStack();

    stack.push(1);
    expect(stack.canDependOn(999)).toBe(false);
  });
});

describe("ExecutionStack – withNode() semantics", () => {
  it("handles nested execution correctly", () => {
    const stack = new ExecutionStack();

    stack.withNode(1, () => {
      expect(stack.current()).toBe(1);
      expect(stack.depth()).toBe(1);

      stack.withNode(2, () => {
        expect(stack.current()).toBe(2);
        expect(stack.depth()).toBe(2);
      });

      expect(stack.current()).toBe(1);
      expect(stack.depth()).toBe(1);
    });

    expect(stack.current()).toBeNull();
    expect(stack.depth()).toBe(0);
  });

  it("cleans up stack after thrown exception", () => {
    const stack = new ExecutionStack();

    expect(() =>
      stack.withNode(1, () => {
        stack.withNode(2, () => {
          throw new Error("boom");
        });
      })
    ).toThrow("boom");

    expect(stack.depth()).toBe(0);
    expect(stack.current()).toBeNull();
  });

  it("detects stack corruption inside withNode", () => {
    const stack = new ExecutionStack();

    expect(() =>
      stack.withNode(1, () => {
        stack.push(2);
        stack.pop(); // pops 2
        stack.pop(); // pops 1 (corruption)
      })
    ).toThrow("Execution stack corruption");

    // stack must still be empty after failure
    expect(stack.depth()).toBe(0);
  });
});

describe("ExecutionStack – reset() and epoch behavior", () => {
  it("reset clears logical stack without reallocating membership", () => {
    const stack = new ExecutionStack();

    stack.push(1);
    stack.push(2);
    expect(stack.depth()).toBe(2);
    expect(stack.contains(1)).toBe(true);

    stack.reset();

    expect(stack.depth()).toBe(0);
    expect(stack.current()).toBeNull();
    expect(stack.contains(1)).toBe(false);
    expect(stack.contains(2)).toBe(false);
  });

  it("allows reuse of same NodeId after reset", () => {
    const stack = new ExecutionStack();

    stack.push(42);
    stack.pop();

    stack.reset();

    expect(() => stack.push(42)).not.toThrow();
    expect(stack.current()).toBe(42);
  });
});

describe("ExecutionStack – NodeId validation", () => {
  it("rejects negative NodeId", () => {
    const stack = new ExecutionStack();
    expect(() => stack.push(-1 as NodeId)).toThrow("Invalid NodeId");
  });

  it("rejects non-integer NodeId", () => {
    const stack = new ExecutionStack();
    expect(() => stack.push(1.5 as NodeId)).toThrow("Invalid NodeId");
  });
});

describe("ExecutionStack – growth behavior", () => {
  it("handles large NodeId values by growing membership table", () => {
    const stack = new ExecutionStack(4);

    const bigId = 10_000;
    expect(() => stack.push(bigId)).not.toThrow();
    expect(stack.contains(bigId)).toBe(true);
    expect(stack.current()).toBe(bigId);
  });
});
