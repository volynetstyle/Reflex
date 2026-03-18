import { describe, expect, it, vi } from "vitest";
import { createRuntime } from "../src";
import { ReactiveNodeKind, ReactiveNodeState } from "../src/core";
import { countIncoming } from "./signal_beta.test_utils";

describe("Reactive system - effects", () => {
  it("runs once initially with effect semantics", () => {
    const rt = createRuntime();
    const source = rt.signal(1);
    const spy = vi.fn(() => {
      source.read();
    });

    const effect = rt.effect(spy);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(effect.node.kind).toBe(ReactiveNodeKind.Effect);
    expect(effect.node.state).toBe(
      ReactiveNodeState.Tracking | ReactiveNodeState.SideEffect,
    );
    expect(effect.node.state & ReactiveNodeState.Invalid).toBeFalsy();
    expect(countIncoming(effect.node)).toBe(1);
  });

  it("re-runs only after flush in queued mode", () => {
    const rt = createRuntime();
    const source = rt.signal(1);
    const spy = vi.fn(() => {
      source.read();
    });

    rt.effect(spy);
    source.write(2);

    expect(spy).toHaveBeenCalledTimes(1);
    rt.flush();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("re-runs immediately in eager mode", () => {
    const rt = createRuntime({ effectStrategy: "eager" });
    const source = rt.signal(1);
    const spy = vi.fn(() => {
      source.read();
    });

    rt.effect(spy);
    source.write(2);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("dedupes multiple writes before flush", () => {
    const rt = createRuntime();
    const source = rt.signal(1);
    const spy = vi.fn(() => {
      source.read();
    });

    rt.effect(spy);
    spy.mockClear();

    source.write(2);
    source.write(3);
    source.write(4);

    rt.flush();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(source.read()).toBe(4);
  });

  it("runs cleanup before rerun", () => {
    const rt = createRuntime();
    const source = rt.signal(1);
    const cleanup = vi.fn();
    const spy = vi.fn(() => {
      source.read();
      return cleanup;
    });

    rt.effect(spy);
    source.write(2);
    rt.flush();

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("runs cleanup and disconnects on dispose", () => {
    const rt = createRuntime();
    const source = rt.signal(1);
    const cleanup = vi.fn();
    const spy = vi.fn(() => {
      source.read();
      return cleanup;
    });

    const effect = rt.effect(spy);

    effect.dispose();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(effect.node.state & ReactiveNodeState.Disposed).toBeTruthy();
    expect(countIncoming(effect.node)).toBe(0);

    source.write(2);
    rt.flush();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("switches dynamic dependencies for effects", () => {
    const rt = createRuntime();
    const flag = rt.signal(true);
    const a = rt.signal(1);
    const b = rt.signal(10);
    const spy = vi.fn(() => {
      if (flag.read()) {
        a.read();
      } else {
        b.read();
      }
    });

    const effect = rt.effect(spy);

    expect(countIncoming(effect.node)).toBe(2);

    flag.write(false);
    rt.flush();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(countIncoming(effect.node)).toBe(2);

    spy.mockClear();
    a.write(2);
    rt.flush();
    expect(spy).not.toHaveBeenCalled();

    b.write(20);
    rt.flush();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
