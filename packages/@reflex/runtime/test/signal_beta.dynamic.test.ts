import { describe, expect, it, vi } from "vitest";
import { createRuntime } from "../src";
import { ReactiveNodeState } from "../src/reactivity/shape";
import {
  countIncoming,
  maxSourceEpoch,
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
    const flag = rt.signal(true);
    const a = rt.signal(1);
    const b = rt.signal(10);

    const spy = vi.fn(() => (flag.read() ? a.read() : b.read()));
    const c = rt.computed(spy);

    expect(c()).toBe(1);
    expect(c.node.state & ReactiveNodeState.Tracking).toBeTruthy();

    flag.write(false);
    expect(c()).toBe(10);

    spy.mockClear();
    a.write(2);
    expect(c()).toBe(10);
    expect(spy).not.toHaveBeenCalled();

    b.write(20);
    expect(c()).toBe(20);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("preserves freshness after dependency cleanup", () => {
    const rt = createRuntime();
    const flag = rt.signal(true);
    const a = rt.signal(1);
    const b = rt.signal(10);
    const c = rt.computed(() => (flag.read() ? a.read() : b.read()));

    expect(c()).toBe(1);
    flag.write(false);
    expect(c()).toBe(10);

    expect(countIncoming(c.node)).toBe(2);
    expect(c.node.v).toBeGreaterThanOrEqual(maxSourceEpoch(c.node));

    a.write(2);
    expect(c()).toBe(10);
    expect(c.node.v).toBeGreaterThanOrEqual(maxSourceEpoch(c.node));
  });

  it("drops Tracking when a dependency disappears without a replacement", () => {
    const rt = createRuntime();
    const flag = rt.signal(true);
    const a = rt.signal(1);
    const c = rt.computed(() => (flag.read() ? a.read() : 0));

    expect(c()).toBe(1);
    expect(c.node.state & ReactiveNodeState.Tracking).toBeTruthy();

    flag.write(false);
    expect(c()).toBe(0);
    expect(c.node.state & ReactiveNodeState.Tracking).toBeFalsy();
  });

  it("reuses the tracked edge for repeated reads of the same source", () => {
    const rt = createRuntime();
    const a = rt.signal(2);
    const c = rt.computed(() => a.read() + a.read() + a.read());

    expect(c()).toBe(6);
    expect(countIncoming(c.node)).toBe(1);

    const trackedEdge = c.node.depsTail;
    expect(trackedEdge).toBeTruthy();
    expect(trackedEdge?.from).toBe(a.node);

    a.write(3);
    expect(c()).toBe(9);
    expect(countIncoming(c.node)).toBe(1);
    expect(c.node.depsTail?.from).toBe(a.node);
  });
});
