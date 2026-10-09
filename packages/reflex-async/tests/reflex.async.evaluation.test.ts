import { describe, expect, it } from "vitest";
import { AsyncBlocker, asyncDerived } from "../src/index";
import {
  captureEvaluation,
  createEvaluatedComputed,
  type EvaluationMetrics,
} from "../src/async/evaluation";
import { createRuntime, effect, signal } from "./reflex.test_utils";
import { materializeFrontier } from "../src/async/frontier";

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
    expect(
      materializeFrontier(captureEvaluation(source.read).frontier),
    ).toHaveLength(1);
    expect(
      materializeFrontier(captureEvaluation(() => 2).frontier),
    ).toHaveLength(0);
    source.dispose();
  });

  it("pulls a dirty async root through a warmed computed during sync capture", () => {
    const runtime = createRuntime({ effectStrategy: "flush" });
    const input = signal(1);
    const root = asyncDerived(() => input());
    const cached = createEvaluatedComputed(() => root.read() * 2);

    expect(cached()).toBe(2);
    input.set(2);
    expect(root.commit()?.value).toBe(1);

    let rootCommitDuringCapture: number | undefined;
    const target = asyncDerived(() => {
      const value = cached() + 1;
      rootCommitDuringCapture = root.commit()?.value;
      return value;
    });
    expect(target.read()).toBe(5);
    expect(rootCommitDuringCapture).toBe(2);
    expect(cached()).toBe(4);

    target.dispose();
    root.dispose();
    runtime.flush();
  });

  it("counts equal generations, frontier changes, and downstream false-positive recomputes", () => {
    createRuntime();
    const metrics = (): EvaluationMetrics => ({
      generationRecomputes: 0,
      semanticEqualRecomputes: 0,
      frontierEqualRecomputes: 0,
      frontierChangedRecomputes: 0,
    });
    const trigger = signal(false);
    const stableMetrics = metrics();
    const downstreamMetrics = metrics();
    let downstreamRuns = 0;
    const stable = createEvaluatedComputed(() => {
      trigger();
      return 10;
    }, stableMetrics);
    const downstream = createEvaluatedComputed(() => {
      ++downstreamRuns;
      return stable();
    }, downstreamMetrics);

    expect(downstream()).toBe(10);
    trigger.set(true);
    expect(downstream()).toBe(10);
    expect(stableMetrics).toEqual({
      generationRecomputes: 1,
      semanticEqualRecomputes: 1,
      frontierEqualRecomputes: 1,
      frontierChangedRecomputes: 0,
    });
    expect(downstreamRuns).toBe(2);
    expect(downstreamMetrics.generationRecomputes).toBe(1);
    expect(downstreamMetrics.semanticEqualRecomputes).toBe(1);

    const left = asyncDerived(() => 10);
    const right = asyncDerived(() => 10);
    const choose = signal(false);
    const frontierMetrics = metrics();
    const selected = createEvaluatedComputed(
      () => (choose() ? right : left).read(),
      frontierMetrics,
    );
    expect(selected()).toBe(10);
    choose.set(true);
    expect(selected()).toBe(10);
    expect(frontierMetrics).toEqual({
      generationRecomputes: 1,
      semanticEqualRecomputes: 0,
      frontierEqualRecomputes: 0,
      frontierChangedRecomputes: 1,
    });

    left.dispose();
    right.dispose();
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
