import { describe, expect, it } from "vitest";
import { Attempt, withAsyncExecution } from "../src/async/attempt";
import { AsyncProtocolError } from "../src/async/errors";
import type { AsyncSource } from "../src/async/types";

const source = { read: () => 7, commit: () => ({ value: 7, version: 1, token: 1 }) } as AsyncSource<number>;

describe("async execution capability lifetime", () => {
  it("authorizes extracted methods only for their synchronous active handle", async () => {
    const outer = new Attempt(1, () => true);
    let captured!: { read: () => number; commit: () => unknown };
    withAsyncExecution(outer, (execution) => {
      const { read, commit } = execution;
      captured = { read: () => read(source), commit: () => commit(source) };
      expect(captured.read()).toBe(7);
      expect(captured.commit()).toEqual({ value: 7, version: 1, token: 1 });
      withAsyncExecution(new Attempt(2, () => true), (nested) => {
        expect(() => captured.read()).toThrow(AsyncProtocolError);
        const { read: nestedRead } = nested;
        expect(nestedRead(source)).toBe(7);
      });
      expect(captured.read()).toBe(7);
    });
    await Promise.resolve();
    expect(() => captured.read()).toThrow(AsyncProtocolError);
    expect(() => captured.commit()).toThrow(AsyncProtocolError);
  });

  it("restores an outer capability after a nested throw and rejects aborted attempts", () => {
    const attempt = new Attempt(1, () => true);
    withAsyncExecution(attempt, (execution) => {
      const { read, commit } = execution;
      expect(() => withAsyncExecution(new Attempt(2, () => true), () => { throw new Error("nested"); })).toThrow("nested");
      expect(read(source)).toBe(7);
      attempt.controller.abort();
      expect(() => read(source)).toThrow(AsyncProtocolError);
      expect(() => commit(source)).toThrow(AsyncProtocolError);
    });
  });
});
