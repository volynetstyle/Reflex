import { describe, expect, it, vi } from "vitest";
import { computed, createRuntime, hold, scan } from "../src";
import { ReactiveNodeState } from "../src/reactivity/shape";
import { countIncoming } from "./signal_beta.test_utils";

describe("Reactive system - events and scan", () => {
  it("accumulates events in FIFO order through a scan node", () => {
    const rt = createRuntime();
    const increments = rt.event<number>();
    const total = scan(increments, 0, (acc, value) => acc + value);
    const doubled = computed(() => total.read() * 2);

    increments.emit(1);
    increments.emit(2);
    increments.emit(3);

    expect(total.node.state & ReactiveNodeState.Producer).toBeTruthy();
    expect(total()).toBe(6);
    expect(doubled()).toBe(12);
  });

  it("runs the reducer exactly once per delivered event", () => {
    const rt = createRuntime();
    const source = rt.event<number>();
    const reducer = vi.fn((acc: number, value: number) => acc + value);
    const total = scan(source, 0, reducer);
    const left = computed(() => total.read());
    const right = computed(() => total.read() * 10);

    source.emit(2);

    expect(reducer).toHaveBeenCalledTimes(1);
    expect(left()).toBe(2);
    expect(right()).toBe(20);
    expect(reducer).toHaveBeenCalledTimes(1);
  });

  it("delays eager effects until nested event delivery settles", () => {
    const rt = createRuntime({ effectStrategy: "eager" });
    const source = rt.event<number>();
    const total = scan(source, 0, (acc, value) => acc + value);
    const seen: number[] = [];

    rt.effect(() => {
      seen.push(total.read());
    });

    source.subscribe((value) => {
      if (value === 1) {
        source.emit(2);
      }
    });

    source.emit(1);

    expect(seen).toEqual([0, 3]);
  });

  it("disconnects scan subscribers and unsubscribes on dispose", () => {
    const rt = createRuntime();
    const source = rt.event<number>();
    const total = scan(source, 10, (acc, value) => acc + value);
    const effect = rt.effect(() => {
      total.read();
    });

    expect(countIncoming(effect.node)).toBe(1);

    total.dispose();

    expect(total.node.state & ReactiveNodeState.Disposed).toBeTruthy();
    expect(countIncoming(effect.node)).toBe(0);

    source.emit(5);
    rt.flush();

    expect(total()).toBe(10);
  });

  it("holds the latest event payload as state", () => {
    const rt = createRuntime();
    const source = rt.event<string>();
    const latest = hold(source, "idle");

    source.emit("ready");
    source.emit("done");

    expect(latest()).toBe("done");
  });
});