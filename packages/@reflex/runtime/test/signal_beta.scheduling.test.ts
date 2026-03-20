import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRuntime } from "../src";
import { ReactiveNodeState } from "../src/reactivity/shape";
import { setup } from "./signal_beta.test_utils";

describe("Reactive system - smart recomputation and laziness", () => {
  let signal: ReturnType<typeof setup>["signal"];
  let computed: ReturnType<typeof setup>["computed"];

  beforeEach(() => {
    ({ signal, computed } = setup());
  });

  it("skips downstream recompute when upstream value stays equal", () => {
    const spyC = vi.fn((n: number) => n + 1);
    const [x, setX] = signal(1);
    const b = computed(() => {
      x();
      return 42;
    });
    const c = computed(() => spyC(b()));

    expect(c()).toBe(43);
    setX(999);
    expect(c()).toBe(43);
    expect(spyC).toHaveBeenCalledTimes(1);
  });

  it("skips diamond sink recompute when both branches stay equal", () => {
    const [x, setX] = signal(1);
    const b = computed(() => {
      x();
      return 10;
    });
    const c = computed(() => {
      x();
      return 20;
    });
    const dSpy = vi.fn(() => b() + c());
    const d = computed(dSpy);

    expect(d()).toBe(30);
    setX(999);
    expect(d()).toBe(30);
    expect(dSpy).toHaveBeenCalledTimes(1);
  });

  it("does not recompute unrelated branches", () => {
    const spyA = vi.fn((n: number) => n);
    const spyB = vi.fn((n: number) => n);

    const [x, setX] = signal(1);
    const [y] = signal(100);

    const a = computed(() => spyA(x()));
    const b = computed(() => spyB(y()));
    const sum = computed(() => a() + b());

    expect(sum()).toBe(101);
    setX(10);
    expect(sum()).toBe(110);

    expect(spyA).toHaveBeenCalledTimes(2);
    expect(spyB).toHaveBeenCalledTimes(1);
  });

  it("clears dirty state after a stable recompute", () => {
    const rt = createRuntime();
    const x = rt.signal(1);
    const c = rt.computed(() => x.read() % 2);

    expect(c()).toBe(1);

    x.write(3);
    expect(c()).toBe(1);
    expect(
      c.node.state & (ReactiveNodeState.Invalid | ReactiveNodeState.Changed),
    ).toBe(0);
  });

  it("keeps computeds lazy until their first read", () => {
    const spy = vi.fn(() => 777);
    computed(spy);
    expect(spy).not.toHaveBeenCalled();
  });

  it("reuses eager memo value on the first explicit read", () => {
    const rt = createRuntime();
    const x = rt.signal(5);
    const spy = vi.fn(() => x.read() * 2);
    const m = rt.memo(spy);

    expect(m()).toBe(10);
    expect(m()).toBe(10);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does not compute unused derivations after writes", () => {
    const spy = vi.fn((n: number) => n * 2);
    const [x, setX] = signal(1);
    computed(() => spy(x()));

    setX(10);
    setX(20);
    setX(30);
    expect(spy).not.toHaveBeenCalled();
  });

  it("marks downstream invalid without recomputing eagerly", () => {
    const rt = createRuntime();
    const x = rt.signal(1);
    const spy = vi.fn(() => x.read() * 2);
    const c = rt.computed(spy);

    expect(c()).toBe(2);
    spy.mockClear();

    x.write(2);
    expect(c.node.state & ReactiveNodeState.Invalid).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
  });

  it("settles a dirty signal and shallow-propagates confirmed change to sibling subscribers", () => {
    const rt = createRuntime();
    const x = rt.signal(1);
    const left = rt.computed(() => x.read() + 1);
    const rightSpy = vi.fn(() => x.read() * 10);
    const right = rt.computed(rightSpy);

    expect(left()).toBe(2);
    expect(right()).toBe(10);
    rightSpy.mockClear();

    x.write(2);
    expect(right.node.state & ReactiveNodeState.Invalid).toBeTruthy();
    expect(right.node.state & ReactiveNodeState.Changed).toBeFalsy();

    expect(left()).toBe(3);
    expect(right.node.state & ReactiveNodeState.Changed).toBeTruthy();
    expect(rightSpy).not.toHaveBeenCalled();

    expect(right()).toBe(20);
    expect(rightSpy).toHaveBeenCalledTimes(1);
  });

  it("clears dirty flags after a settling read", () => {
    const rt = createRuntime();
    const x = rt.signal(1);
    const c = rt.computed(() => x.read() * 2);

    x.write(2);
    expect(
      c.node.state & (ReactiveNodeState.Invalid | ReactiveNodeState.Changed),
    ).toBeTruthy();

    expect(c()).toBe(4);
    expect(
      c.node.state & (ReactiveNodeState.Invalid | ReactiveNodeState.Changed),
    ).toBeFalsy();
  });

  it("keeps tracking through stable recomputes", () => {
    const rt = createRuntime();
    const x = rt.signal(1);
    const c = rt.computed(() => x.read() * 2);

    expect(c()).toBe(2);
    expect(c.node.state & ReactiveNodeState.Tracking).toBeTruthy();

    x.write(5);
    expect(c()).toBe(10);
    expect(c.node.state & ReactiveNodeState.Tracking).toBeTruthy();
  });

  it("re-enables tracking after discovering a new dependency", () => {
    const rt = createRuntime();
    const flag = rt.signal(true);
    const a = rt.signal(1);
    const b = rt.signal(2);

    const c = rt.computed(() => (flag.read() ? a.read() : b.read()));

    expect(c()).toBe(1);
    expect(c.node.state & ReactiveNodeState.Tracking).toBeTruthy();

    flag.write(false);
    expect(c()).toBe(2);
    expect(c.node.state & ReactiveNodeState.Tracking).toBe(0);

    b.write(3);
    expect(c()).toBe(3);
    expect(c.node.state & ReactiveNodeState.Tracking).toBeTruthy();
  });
});
