import { describe, expect, it } from "vitest";
import { batch, createRuntime, effect, signal } from "../src";

describe("batch reactive settled deferral", () => {
  it("does not emit settled for an empty batch", () => {
    let settled = 0;
    createRuntime({
      hooks: {
        reactiveSettledDispatcher() {
          settled += 1;
        },
      },
    });

    batch(() => {});

    expect(settled).toBe(0);
  });

  it("coalesces multiple writes into one settled emit", () => {
    let settled = 0;
    createRuntime({
      hooks: {
        reactiveSettledDispatcher() {
          settled += 1;
        },
      },
    });
    const [, setValue] = signal(0);

    batch(() => {
      setValue(1);
      setValue(2);
      setValue(3);
    });

    expect(settled).toBe(1);
  });

  it("applies writes immediately and exposes fresh reads inside a batch", () => {
    createRuntime();
    const [value, setValue] = signal(0);

    batch(() => {
      setValue(1);
      expect(value()).toBe(1);
    });
  });

  it("waits for the outer nested batch before emitting settled", () => {
    let settled = 0;
    createRuntime({
      hooks: {
        reactiveSettledDispatcher() {
          settled += 1;
        },
      },
    });
    const [, setValue] = signal(0);

    batch(() => {
      setValue(1);
      batch(() => {
        setValue(2);
      });
      expect(settled).toBe(0);
    });

    expect(settled).toBe(1);
  });

  it("restores batch depth when a batch throws", () => {
    let settled = 0;
    createRuntime({
      hooks: {
        reactiveSettledDispatcher() {
          settled += 1;
        },
      },
    });
    const [, setValue] = signal(0);

    expect(() => {
      batch(() => {
        setValue(1);
        throw new Error("boom");
      });
    }).toThrow("boom");

    expect(settled).toBe(1);

    setValue(2);

    expect(settled).toBe(2);
  });

  it("closes and flushes scheduler policy before emitting settled", () => {
    const events: string[] = [];
    const runtime = createRuntime({
      effectStrategy: "sab",
      hooks: {
        reactiveSettledDispatcher() {
          events.push("settled");
        },
      },
    });
    const [value, setValue] = signal(0);

    effect(() => {
      value();
      events.push("effect");
    });
    events.length = 0;

    runtime.batch(() => setValue(1));

    expect(events).toEqual(["effect", "settled"]);
  });

  it("restores both batch depths when eager flush throws", () => {
    let settled = 0;
    const runtime = createRuntime({
      effectStrategy: "eager",
      hooks: {
        reactiveSettledDispatcher() {
          settled += 1;
        },
      },
    });
    const [bad, setBad] = signal(0);
    const [good, setGood] = signal(0);

    effect(() => {
      if (bad() === 1) throw new Error("flush failed");
    });
    effect(() => good());

    expect(() => runtime.batch(() => setBad(1))).toThrow("flush failed");
    expect(runtime.ctx.execution.batchDepth).toBe(0);

    const before = settled;
    setGood(1);
    expect(settled).toBe(before + 1);
  });

  it("preserves callback and flush errors in lifecycle order", () => {
    const runtime = createRuntime({ effectStrategy: "eager" });
    const [source, setSource] = signal(0);
    const callbackError = new Error("callback failed");
    const flushError = new Error("flush failed");

    effect(() => {
      if (source() === 1) throw flushError;
    });

    let thrown: unknown;
    try {
      runtime.batch(() => {
        setSource(1);
        throw callbackError;
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AggregateError);
    expect((thrown as AggregateError).errors).toEqual([
      callbackError,
      flushError,
    ]);
    expect(runtime.ctx.execution.batchDepth).toBe(0);
  });

  it("restores batch depth when the settled hook throws", () => {
    let shouldThrow = true;
    let settled = 0;
    const runtime = createRuntime({
      hooks: {
        reactiveSettledDispatcher() {
          settled += 1;
          if (shouldThrow) throw new Error("settled failed");
        },
      },
    });
    const [source, setSource] = signal(0);
    effect(() => source());

    expect(() => runtime.batch(() => setSource(1))).toThrow("settled failed");
    expect(runtime.ctx.execution.batchDepth).toBe(0);

    shouldThrow = false;
    runtime.batch(() => setSource(2));
    expect(settled).toBe(2);
    expect(runtime.ctx.execution.batchDepth).toBe(0);
  });
});
