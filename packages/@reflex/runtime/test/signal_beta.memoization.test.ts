import { beforeEach, describe, expect, it, vi } from "vitest";
import { setup } from "./signal_beta.test_utils";

describe("Reactive system - memoization", () => {
  let signal: ReturnType<typeof setup>["signal"];
  let computed: ReturnType<typeof setup>["computed"];

  beforeEach(() => {
    ({ signal, computed } = setup());
  });

  it("does not recompute on repeated clean reads", () => {
    const spy = vi.fn((n: number) => n * 10);
    const [x] = signal(4);
    const tenX = computed(() => spy(x()));

    expect(tenX()).toBe(40);
    expect(tenX()).toBe(40);
    expect(tenX()).toBe(40);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does not recompute when a signal is written with the same value", () => {
    const spy = vi.fn((n: number) => n);
    const [s, set] = signal(100);
    const c = computed(() => spy(s()));

    expect(c()).toBe(100);
    set(100);
    expect(c()).toBe(100);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("recomputes each node exactly once across a chain update", () => {
    const aSpy = vi.fn((n: number) => n + 1);
    const bSpy = vi.fn((n: number) => n + 10);
    const cSpy = vi.fn((n: number) => n + 100);

    const [x, setX] = signal(0);
    const a = computed(() => aSpy(x()));
    const b = computed(() => bSpy(a()));
    const c = computed(() => cSpy(b()));

    expect(c()).toBe(111);
    setX(5);
    expect(c()).toBe(116);

    expect(aSpy).toHaveBeenCalledTimes(2);
    expect(bSpy).toHaveBeenCalledTimes(2);
    expect(cSpy).toHaveBeenCalledTimes(2);
  });

  it("recomputes each node exactly once across a diamond update", () => {
    const bSpy = vi.fn((n: number) => n + 1);
    const cSpy = vi.fn((n: number) => n * 2);
    const dSpy = vi.fn((b: number, c: number) => b + c);

    const [x, setX] = signal(3);
    const b = computed(() => bSpy(x()));
    const c = computed(() => cSpy(x()));
    const d = computed(() => dSpy(b(), c()));

    expect(d()).toBe(10);
    setX(5);
    expect(d()).toBe(16);

    expect(bSpy).toHaveBeenCalledTimes(2);
    expect(cSpy).toHaveBeenCalledTimes(2);
    expect(dSpy).toHaveBeenCalledTimes(2);
  });

  it("dedupes repeated reads of the same dirty dependency in one refresh", () => {
    const midSpy = vi.fn((n: number) => n * 2);
    const sinkSpy = vi.fn((left: number, right: number) => left + right);

    const [x, setX] = signal(1);
    const mid = computed(() => midSpy(x()));
    const sink = computed(() => sinkSpy(mid(), mid()));

    expect(sink()).toBe(4);
    setX(5);
    expect(sink()).toBe(20);

    expect(midSpy).toHaveBeenCalledTimes(2);
    expect(sinkSpy).toHaveBeenCalledTimes(2);
  });

  it("refreshes only the demanded dirty branch on read", () => {
    const leftSpy = vi.fn((n: number) => n + 1);
    const rightSpy = vi.fn((n: number) => n + 10);
    const sinkSpy = vi.fn((n: number) => n * 2);

    const [leftSource, setLeft] = signal(1);
    const [rightSource, setRight] = signal(5);
    const left = computed(() => leftSpy(leftSource()));
    const right = computed(() => rightSpy(rightSource()));
    const sink = computed(() => sinkSpy(left()));

    expect(sink()).toBe(4);

    setLeft(2);
    setRight(6);

    expect(sink()).toBe(6);
    expect(leftSpy).toHaveBeenCalledTimes(2);
    expect(rightSpy).not.toHaveBeenCalled();
    expect(sinkSpy).toHaveBeenCalledTimes(2);
  });
});
