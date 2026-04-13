// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../src/globals.d.ts" />

import { describe, expect, it, vi } from "vitest";
import { computed } from "../src/api/derived";
import { effect } from "../src/api/effect";
import { signal } from "../src/api/signal";
import { createModel, isModel, own } from "../src/infra/model";
import { createRuntime } from "./reflex.test_utils";

describe("Reactive system - model actions", () => {
  it("runs model actions untracked", () => {
    const rt = createRuntime();
    const [source, setSource] = signal(1);
    const snapshots: number[] = [];

    const createTestModel = createModel((ctx) => ({
      source,
      act: ctx.action(() => source()),
      retarget: ctx.action((value: number) => setSource(value)),
    }));

    const model = createTestModel();

    effect(() => {
      snapshots.push(model.act());
    });

    expect(snapshots).toEqual([1]);

    model.retarget(2);
    rt.flush();

    expect(snapshots).toEqual([1]);
  });

  it("batches writes performed inside a model action", () => {
    const rt = createRuntime({ effectStrategy: "eager" });
    const [count, setCount] = signal(0);
    const seen: number[] = [];

    const createCounterModel = createModel((ctx) => ({
      count,
      bumpTwice: ctx.action(() => {
        setCount(1);
        setCount(2);
      }),
    }));

    const model = createCounterModel();

    effect(() => {
      seen.push(model.count());
    });

    expect(seen).toEqual([0]);

    model.bumpTwice();

    expect(seen).toEqual([0, 2]);
    expect(model.count()).toBe(2);
    rt.flush();
    expect(seen).toEqual([0, 2]);
  });

  it("supports nested readable values and branded actions", () => {
    createRuntime();
    const [count, setCount] = signal(1);
    const doubled = computed(() => count() * 2);

    const createCounterModel = createModel((ctx) => ({
      count,
      nested: {
        doubled,
        inc: ctx.action(() => setCount((value) => value + 1)),
      },
    }));

    const model = createCounterModel();

    expect(isModel(model)).toBe(true);
    expect(model.count()).toBe(1);
    expect(model.nested.doubled()).toBe(2);

    model.nested.inc();

    expect(model.count()).toBe(2);
    expect(model.nested.doubled()).toBe(4);
  });

  it("rejects effects returned from a model factory", () => {
    createRuntime();
    const [count] = signal(1);

    expect(() =>
      createModel(() => ({
        stop: effect(() => {
          count();
        }),
      }))(),
    ).toThrowError(
      "Invalid model.stop: model values must be readable reactive values, model actions, or nested objects.",
    );
  });

  it("rejects plain functions returned from a model factory", () => {
    createRuntime();

    expect(() =>
      createModel(() => ({
        invalid: () => 123,
      }))(),
    ).toThrowError(
      "Invalid model.invalid: model values must be readable reactive values, model actions, or nested objects.",
    );
  });

  it("throws when calling an action after disposal", () => {
    createRuntime();

    const createTestModel = createModel((ctx) => ({
      run: ctx.action(() => 1),
    }));

    const model = createTestModel();

    model[Symbol.dispose]();

    expect(() => model.run()).toThrowError(
      "Cannot call a model action after the model was disposed.",
    );
  });

  it("runs cleanup functions in reverse order during disposal", () => {
    createRuntime();
    const calls: string[] = [];

    const createTestModel = createModel((ctx) => {
      ctx.onDispose(() => calls.push("first"));
      ctx.onDispose(() => calls.push("second"));

      return {
        run: ctx.action(() => {}),
      };
    });

    const model = createTestModel();
    model[Symbol.dispose]();

    expect(calls).toEqual(["second", "first"]);
  });

  it("owns nested disposables through ctx.onDispose", () => {
    createRuntime();
    const dispose = vi.fn();

    const child = {
      [Symbol.dispose]: dispose,
    };

    const createTestModel = createModel((ctx) => ({
      child: own(ctx, child),
    }));

    const model = createTestModel();
    model[Symbol.dispose]();

    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
