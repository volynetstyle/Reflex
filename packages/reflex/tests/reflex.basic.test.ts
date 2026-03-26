import { beforeEach, describe, expect, it } from "vitest";
import { setup } from "./reflex.test_utils";

describe("Reactive system - basic correctness", () => {
  let signal: ReturnType<typeof setup>["signal"];
  let computed: ReturnType<typeof setup>["computed"];

  beforeEach(() => {
    ({ signal, computed } = setup());
  });

  it("returns the initial signal value", () => {
    const [value] = signal(42);
    expect(value()).toBe(42);
  });

  it("derives computed values from signals", () => {
    const [value] = signal(7);
    const double = computed(() => value() * 2);

    expect(double()).toBe(14);
  });

  it("updates computed values after a signal write", () => {
    const [count, setCount] = signal(1);
    const next = computed(() => count() + 1);

    expect(next()).toBe(2);
    setCount(10);
    expect(next()).toBe(11);
  });

  it("supports updater functions", () => {
    const [count, setCount] = signal(2);

    expect(setCount((prev) => prev + 3)).toBe(5);
    expect(count()).toBe(5);
  });

  it("allows empty writes when undefined is part of the signal type", () => {
    const [value, setValue] = signal<number | undefined>(1);

    expect(setValue()).toBeUndefined();
    expect(value()).toBeUndefined();
  });

  it("keeps only the last of multiple writes before the next read", () => {
    const [value, setValue] = signal(0);
    const view = computed(() => value());

    setValue(1);
    setValue(7);
    setValue(3);
    setValue(8);

    expect(view()).toBe(8);
  });
});
