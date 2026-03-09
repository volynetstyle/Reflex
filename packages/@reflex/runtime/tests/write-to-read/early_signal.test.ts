import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, effect, signal } from "../api/reactivity";
import {
  resetStats,
  stats,
} from "../../src/reactivity/walkers/devkit/walkerStats";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tracker<T extends string>(...names: T[]) {
  const calls = Object.fromEntries(names.map((n) => [n, 0])) as Record<
    T,
    number
  >;
  const hit = (n: T) => calls[n]++;
  return { calls, hit };
}

describe("graph invariants", () => {
  it("diamond: unchanged branch is not recomputed", () => {
    let callsB = 0;
    let callsC = 0;
    let callsD = 0;

    const [a, setA] = signal(1);

    const B = computed(() => {
      callsB++;
      return a() + 1;
    });

    const C = computed(() => {
      callsC++;
      return a() * 0;
    });

    const D = computed(() => {
      callsD++;
      return B() + C();
    });

    // initial run
    expect(D()).toBe(2);

    expect({
      B: callsB,
      C: callsC,
      D: callsD,
    }).toEqual({
      B: 1,
      C: 1,
      D: 1,
    });

    // update
    setA(2);

    expect(D()).toBe(3);

    expect({
      B: callsB,
      C: callsC,
      D: callsD,
    }).toEqual({
      B: 2,
      C: 2,
      D: 2,
    });
  });

  it("should update when deep dependency is updated", () => {
    const [x, setX] = signal(1);
    const [y] = signal(1);

    const a = computed(() => x() + y());
    const b = computed(() => a());

    setX(2);

    expect(b()).toBe(3);
  });

  it("should update when deep computed dependency is updated", () => {
    const [x, setX] = signal(10);
    const [y] = signal(10);

    const a = computed(() => x() + y());
    const b = computed(() => a());
    const c = computed(() => b());

    setX(20);

    expect(c()).toBe(30);
  });

  it("should only re-compute when needed", () => {
    const computedFn = vi.fn();

    const [x, setX] = signal(10);
    const [y, setY] = signal(10);

    const a = computed(() => computedFn(x() + y()));

    a(); // ← перший read

    expect(computedFn).toHaveBeenCalledTimes(1);
    expect(computedFn).toHaveBeenCalledWith(20);

    a();
    expect(computedFn).toHaveBeenCalledTimes(1);

    setX(20);

    a();
    expect(computedFn).toHaveBeenCalledTimes(2);

    setY(20);

    a();
    expect(computedFn).toHaveBeenCalledTimes(3);
  });

  it("should only re-compute whats needed", () => {
    const memoA = vi.fn((n) => n);
    const memoB = vi.fn((n) => n);

    const [x, setX] = signal(10);
    const [y, setY] = signal(10);

    const a = computed(() => memoA(x()));
    const b = computed(() => memoB(y()));
    const c = computed(() => a() + b());

    expect(c()).toBe(20);

    expect(memoA).toHaveBeenCalledTimes(1);
    expect(memoB).toHaveBeenCalledTimes(1);

    setX(20);

    expect(c()).toBe(30);

    expect(memoA).toHaveBeenCalledTimes(2);
    expect(memoB).toHaveBeenCalledTimes(1);

    setY(20);

    expect(c()).toBe(40);

    expect(memoA).toHaveBeenCalledTimes(2);
    expect(memoB).toHaveBeenCalledTimes(2);
  });
});
