import { describe, expect, it, vi } from "vitest";
import { createRuntime, signal } from "../src";
import { ReactiveNodeState } from "../src/reactivity/shape";
import { countIncoming } from "./signal_beta.test_utils";

describe("Reactive system - effects", () => {
  it("runs once initially with effect semantics", () => {
    const rt = createRuntime();
    const source = signal(1);
    const spy = vi.fn(() => {
      source();
    });

    const effect = rt.effect(spy);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(effect.node.state & ReactiveNodeState.Watcher).toBeTruthy();
    expect(effect.node.state & ReactiveNodeState.Invalid).toBeFalsy();
    expect(effect.node.state & ReactiveNodeState.Changed).toBeFalsy();
    expect(countIncoming(effect.node)).toBe(1);
  });

  it("re-runs only after flush in queued mode", () => {
    const rt = createRuntime();
    const source = signal(1);
    const spy = vi.fn(() => {
      source();
    });

    rt.effect(spy);
    source(2);

    expect(spy).toHaveBeenCalledTimes(1);
    rt.flush();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("re-runs immediately in eager mode", () => {
    const rt = createRuntime({ effectStrategy: "eager" });
    const source = signal(1);
    const spy = vi.fn(() => {
      source();
    });

    rt.effect(spy);
    source(2);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("dedupes multiple writes before flush", () => {
    const rt = createRuntime();
    const source = signal(1);
    const spy = vi.fn(() => {
      source();
    });

    rt.effect(spy);
    spy.mockClear();

    source(2);
    source(3);
    source(4);

    rt.flush();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(source()).toBe(4);
  });

  it("runs cleanup before rerun", () => {
    const rt = createRuntime();
    const source = signal(1);
    const cleanup = vi.fn();
    const spy = vi.fn(() => {
      source();
      return cleanup;
    });

    rt.effect(spy);
    source(2);
    rt.flush();

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("runs cleanup and disconnects on dispose", () => {
    const rt = createRuntime();
    const source = signal(1);
    const cleanup = vi.fn();
    const spy = vi.fn(() => {
      source();
      return cleanup;
    });

    const effect = rt.effect(spy);

    effect.dispose();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(effect.node.state & ReactiveNodeState.Disposed).toBeTruthy();
    expect(countIncoming(effect.node)).toBe(0);

    source(2);
    rt.flush();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("returns a callable disposer", () => {
    const rt = createRuntime();
    const source = signal(1);
    const cleanup = vi.fn();
    const spy = vi.fn(() => {
      source();
      return cleanup;
    });

    const effect = rt.effect(spy);

    effect();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(effect.node.state & ReactiveNodeState.Disposed).toBeTruthy();
    source(2);
    rt.flush();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("switches dynamic dependencies for effects", () => {
    const rt = createRuntime();
    const flag = signal(true);
    const a = signal(1);
    const b = signal(10);
    const spy = vi.fn(() => {
      if (flag()) {
        a();
      } else {
        b();
      }
    });

    const effect = rt.effect(spy);

    expect(countIncoming(effect.node)).toBe(2);

    flag(false);
    rt.flush();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(countIncoming(effect.node)).toBe(2);

    spy.mockClear();
    a(2);
    rt.flush();
    expect(spy).not.toHaveBeenCalled();

    b(20);
    rt.flush();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
