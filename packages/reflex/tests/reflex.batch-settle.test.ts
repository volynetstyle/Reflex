import { describe, expect, it } from "vitest";
import { batch, createRuntime, signal } from "../src";

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
});
