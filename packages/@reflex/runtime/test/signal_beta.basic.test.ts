import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRuntime } from "../src";
import { ReactiveNodeKind } from "../src/reactivity/shape";
import { countIncoming, setup } from "./signal_beta.test_utils";

describe("Reactive system - basic correctness", () => {
  let signal: ReturnType<typeof setup>["signal"];
  let computed: ReturnType<typeof setup>["computed"];

  beforeEach(() => {
    ({ signal, computed } = setup());
  });

  it("keeps diamond reads glitch-free and recomputes sink once", () => {
    const [x, setX] = signal(1);
    const bSpy = vi.fn(() => x() * 2);
    const cSpy = vi.fn(() => x() * 3);
    const dSpy = vi.fn(() => b() + c());

    const b = computed(bSpy);
    const c = computed(cSpy);
    const d = computed(dSpy);

    expect(d()).toBe(5);
    setX(2);
    expect(d()).toBe(10);

    expect(bSpy).toHaveBeenCalledTimes(2);
    expect(cSpy).toHaveBeenCalledTimes(2);
    expect(dSpy).toHaveBeenCalledTimes(2);
    expect(countIncoming(d.node)).toBe(2);
  });

  it("stops SAC chains when an upstream recompute keeps the same value", () => {
    const [x, setX] = signal(0);
    const fnB = vi.fn(() => {
      x();
      return 1;
    });
    const fnC = vi.fn((v: number) => v + 1);
    const fnD = vi.fn((v: number) => v + 1);

    const b = computed(fnB);
    const c = computed(() => fnC(b()));
    const d = computed(() => fnD(c()));

    expect(d()).toBe(3);
    setX(1);
    expect(d()).toBe(3);

    expect(fnB).toHaveBeenCalledTimes(2);
    expect(fnC).toHaveBeenCalledTimes(1);
    expect(fnD).toHaveBeenCalledTimes(1);
  });

  it("returns the initial signal value", () => {
    const [x] = signal(42);
    expect(x()).toBe(42);
  });

  it("derives computed values from signals", () => {
    const [x] = signal(7);
    const double = computed(() => x() * 2);
    expect(double()).toBe(14);
  });

  it("updates computed values after a signal write", () => {
    const [count, setCount] = signal(1);
    const next = computed(() => count() + 1);

    expect(next()).toBe(2);
    setCount(10);
    expect(next()).toBe(11);
  });

  it("keeps only the last of multiple writes", () => {
    const [val, set] = signal(0);
    const viewSpy = vi.fn(() => val());
    const view = computed(viewSpy);

    set(1);
    set(7);
    set(3);
    set(8);

    expect(view()).toBe(8);
    expect(viewSpy).toHaveBeenCalledTimes(1);
  });

  it("creates runtime nodes with explicit kinds", () => {
    const rt = createRuntime();
    const s = rt.signal(1);
    const c = rt.computed(() => s() * 2);

    expect(s.node.kind).toBe(ReactiveNodeKind.Signal);
    expect(c.node.kind).toBe(ReactiveNodeKind.Computed);
    expect(c.node.kind === ReactiveNodeKind.Effect).toBe(false);
  });

  it("computes memos eagerly and caches the first value", () => {
    const rt = createRuntime();
    const s = rt.signal(2);
    const spy = vi.fn(() => s() * 3);

    const m = rt.memo(spy);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(m()).toBe(6);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("supports callable signals for both reads and writes", () => {
    const rt = createRuntime();
    const s = rt.signal(1);
    const c = rt.computed(() => s() * 2);

    expect(s()).toBe(1);
    s(5);
    expect(s()).toBe(5);
    expect(c()).toBe(10);
  });
});
