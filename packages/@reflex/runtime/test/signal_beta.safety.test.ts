import { describe, expect, it } from "vitest";
import { createRuntime } from "../src";
import { countIncoming } from "./signal_beta.test_utils";

describe("Reactive system - safety and robustness", () => {
  it("restores the active consumer after a thrown compute", () => {
    const rt = createRuntime();
    const source = rt.signal(1);
    const boom = rt.computed(() => {
      source.read();
      throw new Error("boom");
    });
    const stable = rt.computed(() => source.read() + 1);

    expect(() => boom()).toThrow("boom");
    expect(rt.ctx.activeComputed).toBe(null);
    expect(stable()).toBe(2);
    expect(rt.ctx.activeComputed).toBe(null);
  });

  it("does not duplicate dependency edges on repeated reads", () => {
    const rt = createRuntime();
    const source = rt.signal(1);
    const derived = rt.computed(() => source.read() * 2);

    expect(derived()).toBe(2);
    expect(derived()).toBe(2);
    expect(derived()).toBe(2);

    expect(countIncoming(derived.node)).toBe(1);
    expect(countIncoming(source.node)).toBe(0);
  });

  it("applies batch writes in order and keeps the last value", () => {
    const rt = createRuntime();
    const source = rt.signal(1);
    const derived = rt.computed(() => source.read() * 10);

    expect(derived()).toBe(10);

    rt.batchWrite([
      [source, 2],
      [source, 7],
      [source, 9],
    ]);

    expect(source.read()).toBe(9);
    expect(derived()).toBe(90);
  });

  it("keeps the previous cached value after a failed recompute", () => {
    const rt = createRuntime();
    const source = rt.signal(1);
    let shouldThrow = false;
    const derived = rt.computed(() => {
      const value = source.read() * 2;
      if (shouldThrow) throw new Error("unstable");
      return value;
    });

    expect(derived()).toBe(2);

    shouldThrow = true;
    source.write(2);
    expect(() => derived()).toThrow("unstable");
    expect(derived.node.payload).toBe(2);
  });

  it("throws on cycles instead of looping forever", () => {
    const rt = createRuntime();
    let a!: ReturnType<typeof rt.computed<number>>;
    let b!: ReturnType<typeof rt.computed<number>>;

    a = rt.computed(() => b() + 1);
    b = rt.computed(() => a() + 1);

    expect(() => a()).toThrow(/Cycle detected/);
  });
});
