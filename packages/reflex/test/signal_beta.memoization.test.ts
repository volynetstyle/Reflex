import { beforeEach, describe, expect, it, vi } from "vitest";
import { setup } from "./signal_beta.test_utils";

describe("Reactive system - memoization", () => {
  let signal: ReturnType<typeof setup>["signal"];
  let computed: ReturnType<typeof setup>["computed"];
  let memo: ReturnType<typeof setup>["memo"];

  beforeEach(() => {
    ({ signal, computed, memo } = setup());
  });

  it("does not recompute on repeated clean reads", () => {
    const spy = vi.fn((n: number) => n * 10);
    const [value] = signal(4);
    const tenX = computed(() => spy(value()));

    expect(tenX()).toBe(40);
    expect(tenX()).toBe(40);
    expect(tenX()).toBe(40);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does not recompute when a signal is written with the same value", () => {
    const spy = vi.fn((n: number) => n);
    const [source, setSource] = signal(100);
    const derived = computed(() => spy(source()));

    expect(derived()).toBe(100);
    setSource(100);
    expect(derived()).toBe(100);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("warms memo once and reuses the cached value on reads", () => {
    const [source] = signal(5);
    const spy = vi.fn(() => source() * 2);
    const warmed = memo(spy);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(warmed()).toBe(10);
    expect(warmed()).toBe(10);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
