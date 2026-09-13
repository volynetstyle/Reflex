import { describe, expect, it } from "vitest";
import { executeDifferential, type Expr, type Op, type Value } from "./harness";

const constant = (value: Value): Expr => ({ type: "constant", value });
const read = (id: string): Expr => ({ type: "read", id });

describe("differential lifecycle commit semantics", () => {
  it("does not track reads performed by cleanup", () => {
    const result = executeDifferential([
      { type: "signal", id: "trigger", value: 0 },
      { type: "signal", id: "incidental", value: 0 },
      {
        type: "effect",
        id: "effect",
        expression: read("trigger"),
        cleanup: read("incidental"),
      },
      { type: "flush" },
      { type: "set", id: "trigger", value: 1 },
      { type: "flush" },
      { type: "set", id: "incidental", value: 1 },
      { type: "flush" },
    ]);
    expect(result[5]?.effects).toEqual([
      { effect: "effect", phase: "cleanup", value: 0 },
      { effect: "effect", phase: "run", value: 1 },
    ]);
    expect(result[7]?.effects).toEqual([]);
  });

  it("does not commit dependencies collected by a failed computed evaluation", () => {
    const failingBranch: Expr = {
      type: "add",
      left: read("partial"),
      right: { type: "throw", message: "failed after partial read" },
    };
    const program: Op[] = [
      { type: "signal", id: "mode", value: false },
      { type: "signal", id: "committed", value: 1 },
      { type: "signal", id: "partial", value: 10 },
      {
        type: "computed",
        id: "value",
        expression: {
          type: "if",
          condition: read("mode"),
          then: failingBranch,
          else: read("committed"),
        },
      },
      { type: "read", id: "value" },
      { type: "set", id: "mode", value: true },
      { type: "read", id: "value" },
      { type: "set", id: "committed", value: 2 },
      { type: "read", id: "value" },
      { type: "set", id: "mode", value: false },
      { type: "read", id: "value" },
    ];
    const result = executeDifferential(program);
    expect(result[4]?.value).toBe(1);
    expect(result[6]?.error?.message).toBe("failed after partial read");
    expect(result[8]?.error?.message).toBe("failed after partial read");
    expect(result[10]?.value).toBe(2);
  });

  it("consumes a throwing cleanup and retries without running computation", () => {
    const result = executeDifferential([
      { type: "signal", id: "trigger", value: 0 },
      {
        type: "effect",
        id: "effect",
        expression: read("trigger"),
        cleanup: { type: "throw", message: "cleanup failed" },
      },
      { type: "flush" },
      { type: "set", id: "trigger", value: 1 },
      { type: "flush" },
      { type: "set", id: "trigger", value: 2 },
      { type: "flush" },
    ]);
    expect(result[4]?.error?.message).toBe("cleanup failed");
    expect(result[4]?.effects).toEqual([]);
    expect(result[6]?.effects).toEqual([
      { effect: "effect", phase: "run", value: 2 },
    ]);
  });

  it("does not retry an initially failed watcher until an observed source changes", () => {
    const result = executeDifferential([
      { type: "signal", id: "source", value: 0 },
      { type: "signal", id: "fail", value: true },
      {
        type: "effect",
        id: "effect",
        expression: {
          type: "add",
          left: read("source"),
          right: { type: "throw", message: "initial failure" },
        },
      },
      { type: "flush" },
      { type: "flush" },
      { type: "set", id: "source", value: 1 },
      { type: "flush" },
    ]);
    expect(result[3]?.error?.message).toBe("initial failure");
    expect(result[4]).toEqual({ effects: [] });
    expect(result[6]?.error?.message).toBe("initial failure");
  });
  it("does not install a cleanup from a failing computation", () => {
    const expression: Expr = {
      type: "if",
      condition: read("fail"),
      then: { type: "throw", message: "compute failed" },
      else: read("source"),
    };
    const result = executeDifferential([
      { type: "signal", id: "fail", value: false },
      { type: "signal", id: "source", value: 1 },
      { type: "effect", id: "effect", expression, cleanup: constant(7) },
      { type: "flush" },
      { type: "set", id: "fail", value: true },
      { type: "flush" },
      { type: "set", id: "fail", value: false },
      { type: "set", id: "source", value: 2 },
      { type: "flush" },
    ]);
    expect(result[5]?.effects).toEqual([
      { effect: "effect", phase: "cleanup", value: 7 },
    ]);
    expect(result[5]?.error?.message).toBe("compute failed");
    expect(result[8]?.effects).toEqual([
      { effect: "effect", phase: "run", value: 2 },
    ]);
  });
});
