import { describe, expect, it, vi } from "vitest";
import { computed, createRuntime, signal } from "../src";
import { ReactiveNodeState } from "../src/reactivity/shape";
import {
  countIncoming,
  setup,
} from "./signal_beta.test_utils";

describe("Reactive system - dynamic dependencies", () => {
  it("switches branches, untracks the old dependency, and follows the new one", () => {
    const { signal, computed } = setup();
    const spy = vi.fn();

    const [flag, toggle] = signal(true);
    const [a, , aSignal] = signal(100);
    const [b, setB, bSignal] = signal(200);

    const c = computed(() => {
      spy();
      return flag() ? a() : b();
    });

    expect(c()).toBe(100);
    toggle(false);
    expect(c()).toBe(200);
    expect(countIncoming(c.node)).toBe(2);

    spy.mockClear();
    setB(999);
    expect(c()).toBe(999);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(countIncoming(c.node)).toBe(2);
    expect(countIncoming(aSignal.node)).toBe(0);
    expect(countIncoming(bSignal.node)).toBe(0);
  });

  it("removes old dependencies after a stable branch switch", () => {
    const rt = createRuntime();
    const flag = signal(true);
    const a = signal(1);
    const b = signal(10);

    const spy = vi.fn(() => (flag() ? a() : b()));
    const c = computed(spy);

    expect(c()).toBe(1);

    flag(false);
    expect(c()).toBe(10);

    spy.mockClear();
    a(2);
    expect(c()).toBe(10);
    expect(spy).not.toHaveBeenCalled();

    b(20);
    expect(c()).toBe(20);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("preserves freshness after dependency cleanup", () => {
    const rt = createRuntime();
    const flag = signal(true);
    const a = signal(1);
    const b = signal(10);
    const c = computed(() => (flag() ? a() : b()));

    expect(c()).toBe(1);
    flag(false);
    expect(c()).toBe(10);

    expect(countIncoming(c.node)).toBe(2);
    expect(
      c.node.state & (ReactiveNodeState.Invalid | ReactiveNodeState.Changed),
    ).toBe(0);

    a(2);
    expect(c()).toBe(10);
    expect(
      c.node.state & (ReactiveNodeState.Invalid | ReactiveNodeState.Changed),
    ).toBe(0);
  });

  it("removes a dependency when it disappears without a replacement", () => {
    const rt = createRuntime();
    const flag = signal(true);
    const a = signal(1);
    const c = computed(() => (flag() ? a() : 0));

    expect(c()).toBe(1);
    expect(countIncoming(c.node)).toBe(2);

    flag(false);
    expect(c()).toBe(0);
    expect(countIncoming(c.node)).toBe(1);
  });

  it("reuses the tracked edge for repeated reads of the same source", () => {
    const rt = createRuntime();
    const a = signal(2);
    const c = computed(() => a() + a() + a());

    expect(c()).toBe(6);
    expect(countIncoming(c.node)).toBe(1);

    const trackedEdge = c.node.depsTail;
    expect(trackedEdge).toBeTruthy();
    expect(trackedEdge?.from).toBe(a.node);

    a(3);
    expect(c()).toBe(9);
    expect(countIncoming(c.node)).toBe(1);
    expect(c.node.depsTail?.from).toBe(a.node);
  });
});
