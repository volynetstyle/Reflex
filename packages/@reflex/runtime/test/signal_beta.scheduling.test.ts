import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  computed as createComputed,
  createRuntime,
  memo as createMemo,
  signal as createSignal,
} from "../src";
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
    createRuntime();
    const x = createSignal(1);
    const c = createComputed(() => x() % 2);

    expect(c()).toBe(1);

    x(3);
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
    createRuntime();
    const x = createSignal(5);
    const spy = vi.fn(() => x() * 2);
    const m = createMemo(spy);

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
    createRuntime();
    const x = createSignal(1);
    const spy = vi.fn(() => x() * 2);
    const c = createComputed(spy);

    expect(c()).toBe(2);
    spy.mockClear();

    x(2);
    expect(c.node.state & ReactiveNodeState.Invalid).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
  });

  it("settles a dirty signal and shallow-propagates confirmed change to sibling subscribers", () => {
    createRuntime();
    const x = createSignal(1);
    const left = createComputed(() => x() + 1);
    const rightSpy = vi.fn(() => x() * 10);
    const right = createComputed(rightSpy);

    expect(left()).toBe(2);
    expect(right()).toBe(10);
    rightSpy.mockClear();

    x(2);
    expect(right.node.state & ReactiveNodeState.Invalid).toBeTruthy();
    expect(right.node.state & ReactiveNodeState.Changed).toBeFalsy();

    expect(left()).toBe(3);
    expect(right.node.state & ReactiveNodeState.Changed).toBeTruthy();
    expect(rightSpy).not.toHaveBeenCalled();

    expect(right()).toBe(20);
    expect(rightSpy).toHaveBeenCalledTimes(1);
  });

  it("settles a dirty computed and shallow-propagates confirmed change to sibling subscribers", () => {
    createRuntime();
    const x = createSignal(1);
    const midSpy = vi.fn(() => x() * 2);
    const mid = createComputed(midSpy);
    const left = createComputed(() => mid() + 1);
    const rightSpy = vi.fn(() => mid() * 10);
    const right = createComputed(rightSpy);

    expect(left()).toBe(3);
    expect(right()).toBe(20);
    midSpy.mockClear();
    rightSpy.mockClear();

    x(2);
    expect(right.node.state & ReactiveNodeState.Invalid).toBeTruthy();
    expect(right.node.state & ReactiveNodeState.Changed).toBeFalsy();

    expect(left()).toBe(5);
    expect(midSpy).toHaveBeenCalledTimes(1);
    expect(right.node.state & ReactiveNodeState.Changed).toBeTruthy();
    expect(rightSpy).not.toHaveBeenCalled();

    expect(right()).toBe(40);
    expect(rightSpy).toHaveBeenCalledTimes(1);
  });

  it("clears dirty flags after a settling read", () => {
    createRuntime();
    const x = createSignal(1);
    const c = createComputed(() => x() * 2);

    x(2);
    expect(
      c.node.state & (ReactiveNodeState.Invalid | ReactiveNodeState.Changed),
    ).toBeTruthy();

    expect(c()).toBe(4);
    expect(
      c.node.state & (ReactiveNodeState.Invalid | ReactiveNodeState.Changed),
    ).toBeFalsy();
  });

  it("keeps dependency shape stable through stable recomputes", () => {
    createRuntime();
    const x = createSignal(1);
    const c = createComputed(() => x() * 2);

    expect(c()).toBe(2);
    expect(c.node.depsTail?.from).toBe(x.node);

    x(5);
    expect(c()).toBe(10);
    expect(c.node.depsTail?.from).toBe(x.node);
  });

  it("reconciles dependencies after discovering a new dependency", () => {
    createRuntime();
    const flag = createSignal(true);
    const a = createSignal(1);
    const b = createSignal(2);

    const c = createComputed(() => (flag() ? a() : b()));

    expect(c()).toBe(1);
    expect(c.node.depsTail?.from).toBe(a.node);

    flag(false);
    expect(c()).toBe(2);
    expect(c.node.depsTail?.from).toBe(b.node);

    b(3);
    expect(c()).toBe(3);
    expect(c.node.depsTail?.from).toBe(b.node);
  });
});
