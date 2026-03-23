import { describe, expect, it } from "vitest";
import { computed, createRuntime, signal } from "../src";
import { ReactiveNodeState } from "../src/reactivity/shape";
import { countIncoming } from "./signal_beta.test_utils";

describe("Reactive system - safety and robustness", () => {
  it("restores the active consumer after a thrown compute", () => {
    const rt = createRuntime();
    const source = signal(1);
    const boom = computed(() => {
      source();
      throw new Error("boom");
    });
    const stable = computed(() => source() + 1);

    expect(() => boom()).toThrow("boom");
    expect(rt.ctx.activeComputed).toBe(null);
    expect(stable()).toBe(2);
    expect(rt.ctx.activeComputed).toBe(null);
  });

  it("does not duplicate dependency edges on repeated reads", () => {
    createRuntime();
    const source = signal(1);
    const derived = computed(() => source() * 2);

    expect(derived()).toBe(2);
    expect(derived()).toBe(2);
    expect(derived()).toBe(2);

    expect(countIncoming(derived.node)).toBe(1);
    expect(countIncoming(source.node)).toBe(0);
  });

  it("applies batch writes in order and keeps the last value", () => {
    const rt = createRuntime();
    const source = signal(1);
    const derived = computed(() => source() * 10);

    expect(derived()).toBe(10);

    rt.batchWrite([
      [source as any, 2],
      [source as any, 7],
      [source as any, 9],
    ]);

    expect(source()).toBe(9);
    expect(derived()).toBe(90);
  });

  it("keeps the previous cached value after a failed recompute", () => {
    createRuntime();
    const source = signal(1);
    let shouldThrow = false;
    const derived = computed(() => {
      const value = source() * 2;
      if (shouldThrow) throw new Error("unstable");
      return value;
    });

    expect(derived()).toBe(2);

    shouldThrow = true;
    source(2);
    expect(() => derived()).toThrow("unstable");
    expect(derived.node.payload).toBe(2);
  });

  it("restores dirty-check stack after a thrown nested recompute", () => {
    const rt = createRuntime();
    const source = signal(1);
    let shouldThrow = false;
    const middle = computed(() => {
      const value = source() * 2;
      if (shouldThrow) throw new Error("boom");
      return value;
    });
    const outer = computed(() => middle() + 1);

    expect(outer()).toBe(3);

    shouldThrow = true;
    source(2);
    expect(() => outer()).toThrow("boom");
    expect(rt.ctx.dirtyCheckStack).toHaveLength(0);

    shouldThrow = false;
    expect(outer()).toBe(5);
    expect(rt.ctx.dirtyCheckStack).toHaveLength(0);
  });

  it("finishes invalidating sibling effects before rethrowing hook errors", () => {
    let invalidations = 0;
    const rt = createRuntime({
      hooks: {
        onEffectInvalidated() {
          invalidations += 1;
          throw new Error("boom");
        },
      },
    });
    const source = signal(1);

    const left = rt.effect(() => {
      source();
    });
    const right = rt.effect(() => {
      source();
    });

    expect(() => source(2)).toThrow("boom");
    expect(invalidations).toBe(2);
    expect(left.node.state & ReactiveNodeState.Invalid).toBeTruthy();
    expect(right.node.state & ReactiveNodeState.Invalid).toBeTruthy();
    expect(rt.ctx.propagateStack).toHaveLength(0);
  });

  // it("throws on cycles instead of looping forever", () => {
  //   const rt = createRuntime();
  //   let a!: ReturnType<typeof rt.Consumer<number>>;
  //   let b!: ReturnType<typeof rt.Consumer<number>>;

  //   a = rt.Consumer(() => b() + 1);
  //   b = rt.Consumer(() => a() + 1);

  //   expect(() => a()).toThrow(/Cycle detected/);
  // });
});
