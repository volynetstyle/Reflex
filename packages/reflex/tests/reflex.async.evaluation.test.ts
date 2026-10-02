import { describe, expect, it } from "vitest";
import { AsyncBlocker, asyncDerived } from "../src/unstable/async";
import {
  captureEvaluation,
  createEvaluatedComputed,
} from "../src/unstable/async/evaluation";
import { createRuntime, effect, signal } from "./reflex.test_utils";

describe("async evaluated generations", () => {
  it("captures inputs read by synchronous thenable getters", async () => {
    createRuntime();
    const input = signal(1);
    const parent = asyncDerived(input);
    const source = asyncDerived<number>((execution) => ({
      get then() {
        const promise = Promise.resolve(execution.read(parent));
        return promise.then.bind(promise);
      },
    }));
    input.set(2);
    expect(await source.resolve()).toBe(2);
    source.dispose();
    parent.dispose();
  });

  it("keeps ordinary failed computations retryable and restores capture context", () => {
    createRuntime();
    const fail = signal(false);
    const error = new Error("ordinary computation failure");
    let calls = 0;
    const value = createEvaluatedComputed(() => {
      ++calls;
      if (fail()) throw error;
      return 7;
    });
    expect(value()).toBe(7);
    fail.set(true);
    expect(value).toThrow(error);
    expect(value).toThrow(error);
    expect(calls).toBe(3);
    fail.set(false);
    expect(value()).toBe(7);
    expect(calls).toBe(4);
    const source = asyncDerived(() => 1);
    expect(captureEvaluation(source.read).frontier.size).toBe(1);
    expect(captureEvaluation(() => 2).frontier.size).toBe(0);
    source.dispose();
  });

  it.each([undefined, "failure", new Error("async failure")])(
    "caches async failures while preserving the original error inside user catch blocks: %s",
    (error) => {
      createRuntime();
      const source = asyncDerived<number>(() => {
        throw error;
      });
      let calls = 0;
      const child = createEvaluatedComputed(() => {
        ++calls;
        return source.read();
      });
      const parent = createEvaluatedComputed(child);
      const observe = (): unknown => {
        try {
          parent();
        } catch (caught) {
          return caught;
        }
        throw new Error("Expected failure");
      };
      expect(observe()).toBe(error);
      expect(observe()).toBe(error);
      expect(calls).toBe(1);
      const recovered = createEvaluatedComputed(() => {
        try {
          return source.read();
        } catch (caught) {
          expect(caught).toBe(error);
          return 42;
        }
      });
      expect(recovered()).toBe(42);
      let retries = 0;
      const ordinary = createEvaluatedComputed(() => {
        ++retries;
        try {
          source.read();
        } catch {
          throw new Error("transformed");
        }
        return 0;
      });
      expect(ordinary).toThrow("transformed");
      expect(ordinary).toThrow("transformed");
      expect(retries).toBe(2);
      source.dispose();
    },
  );

  it.each(["flush", "sab", "eager"] as const)(
    "%s: connects a blocked generation before throwing and wakes an effect through cached parents",
    async (effectStrategy) => {
      const runtime = createRuntime({ effectStrategy });
      let resolve!: (value: number) => void;
      const promise = new Promise<number>((done) => {
        resolve = done;
      });
      const source = asyncDerived(() => promise);
      const child = createEvaluatedComputed(() => source.read() + 1);
      const parent = createEvaluatedComputed(() => child() * 2);
      const seen: Array<number | "blocked"> = [];
      const stop = effect(() => {
        try {
          seen.push(parent());
        } catch (error) {
          if (!(error instanceof AsyncBlocker)) throw error;
          seen.push("blocked");
        }
      });
      runtime.flush();
      expect(seen.at(-1)).toBe("blocked");
      resolve(2);
      await source.resolve();
      runtime.flush();
      expect(seen.at(-1)).toBe(6);
      stop();
      source.dispose();
    },
  );
});
