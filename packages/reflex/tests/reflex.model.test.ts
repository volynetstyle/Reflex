// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../src/globals.d.ts" />

import { describe, expect, it, vi } from "vitest";
import { computed } from "../src/api/derived";
import { effect } from "../src/api/effect";
import { signal } from "../src/api/signal";
import { createModel, isModel, own, readModelValue } from "../src/infra/model";
import { createRuntime } from "./reflex.test_utils";

describe("Reactive system - model actions", () => {
  it("reads model readable values without invoking model actions", () => {
    createRuntime();
    const [count] = signal(1);

    const createTestModel = createModel((ctx) => ({
      count,
      save: ctx.action(() => {
        throw new Error("action should not be invoked while reading a model value");
      }),
    }));

    const model = createTestModel();

    expect(readModelValue(model.count)).toBe(1);
    expect(readModelValue(model.save)).toBe(model.save);
  });

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

  it("couple writes applies inside action in order (flush)", () => {
    const rt = createRuntime({ effectStrategy: "flush" });
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

    expect(seen).toEqual([0]);
    expect(model.count()).toBe(2);
    rt.flush();
    expect(seen).toEqual([0, 2]);
  });

  it("keeps model actions atomic for eager effects", () => {
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

  it("supports nested readable values and model actions", () => {
    createRuntime();

    const createCounterModel = createModel((ctx, v: number = 0) => {
      const [count, setCount] = signal(1);
      const doubled = computed(() => count() * 2);

      return {
        count,
        nested: {
          doubled,
          inc: ctx.action(() => setCount((value: number) => value * v)),
        },
      };
    });

    const model = createCounterModel(10);

    expect(isModel(model)).toBe(true);
    expect(model.count()).toBe(1);
    expect(model.nested.doubled()).toBe(2);

    model.nested.inc();

    expect(model.count()).toBe(10);
    expect(model.nested.doubled()).toBe(20);
  });

  it("allows effect values returned from a model factory in production mode", () => {
    createRuntime();
    const [count] = signal(1);

    const model = createModel(() => ({
      stop: effect(() => {
        count();
      }),
    }))();

    expect(typeof model.stop).toBe("function");
  });

  it("allows plain functions returned from a model factory in production mode", () => {
    createRuntime();

    const model = createModel(() => ({
      invalid: () => 123,
    }))();

    expect(model.invalid()).toBe(123);
  });

  it("returns undefined when calling an action after disposal in production mode", () => {
    createRuntime();

    const createTestModel = createModel((ctx) => ({
      run: ctx.action(() => 1),
    }));

    const model = createTestModel();

    model[Symbol.dispose]();

    expect(model.run()).toBeUndefined();
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
