import { beforeEach, describe, expect, it } from "vitest";
import { setup } from "./reflex.test_utils";

describe("Reactive system - basic correctness", () => {
  let signal: ReturnType<typeof setup>["signal"];
  let computed: ReturnType<typeof setup>["computed"];

  beforeEach(() => {
    ({ signal, computed } = setup());
  });

  it("returns the initial signal value", () => {
    const value = signal(42);
    expect(value()).toBe(42);
    expect(Array.isArray(value)).toBe(false);
    expect(Symbol.iterator in value).toBe(false);
  });

  it("derives computed values from signals", () => {
    const value = signal(7);
    const double = computed(() => value() * 2);

    expect(double()).toBe(14);
  });

  it("updates computed values after a signal write", () => {
    const count = signal(1);
    const next = computed(() => count() + 1);

    expect(next()).toBe(2);
    count.set(10);
    expect(next()).toBe(11);
  });

  it("supports updater functions", () => {
    const count = signal(2);

    count.set((prev: number) => prev + 3);

    expect(count()).toBe(5);
  });

  it("allows empty writes when undefined is part of the signal type", () => {
    const value = signal<number | undefined>(1);

    expect(value.set()).toBeUndefined();
    expect(value()).toBeUndefined();
  });

  it("keeps only the last of multiple writes before the next read", () => {
    const value = signal(0);
    const view = computed(() => value());

    value.set(1);
    value.set(7);
    value.set(3);
    value.set(8);

    expect(view()).toBe(8);
  });
});
