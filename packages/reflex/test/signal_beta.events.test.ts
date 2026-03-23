import { describe, expect, it, vi } from "vitest";
import { computed } from "../src/api/derived";
import { hold, scan } from "../src/api/event";
import { createRuntime } from "./signal_beta.test_utils";

describe("Reactive system - events", () => {
  it("delivers emitted values to subscribers in order", () => {
    const rt = createRuntime();
    const source = rt.event<number>();
    const seen: number[] = [];

    source.subscribe((value) => {
      seen.push(value);
    });

    source.emit(1);
    source.emit(2);
    source.emit(3);

    expect(seen).toEqual([1, 2, 3]);
  });

  it("queues nested emits after the current delivery finishes", () => {
    const rt = createRuntime();
    const source = rt.event<number>();
    const seen: string[] = [];

    source.subscribe((value) => {
      seen.push(`a${value}`);

      if (value === 1) {
        source.emit(2);
      }
    });

    source.subscribe((value) => {
      seen.push(`b${value}`);
    });

    source.emit(1);

    expect(seen).toEqual(["a1", "b1", "a2", "b2"]);
  });

  it("scan accumulates values and can feed a computed", () => {
    const rt = createRuntime();
    const source = rt.event<number>();
    const [readTotal] = scan(source, 0, (acc, value) => acc + value);
    const doubled = computed(() => readTotal() * 2);

    source.emit(1);
    source.emit(2);
    source.emit(3);

    expect(readTotal()).toBe(6);
    expect(doubled()).toBe(12);
  });

  it("scan reducer runs once per event and dispose is idempotent", () => {
    const rt = createRuntime();
    const source = rt.event<number>();
    const reducer = vi.fn((acc: number, value: number) => acc + value);
    const [readTotal, dispose] = scan(source, 10, reducer);

    source.emit(5);
    expect(reducer).toHaveBeenCalledTimes(1);
    expect(readTotal()).toBe(15);

    dispose();
    dispose();
    source.emit(20);
    expect(readTotal()).toBe(15);
    expect(reducer).toHaveBeenCalledTimes(1);
  });

  it("hold keeps the latest payload", () => {
    const rt = createRuntime();
    const source = rt.event<string>();
    const [latest] = hold(source, "idle");

    source.emit("ready");
    source.emit("done");

    expect(latest()).toBe("done");
  });

  it("ignores manually delivered values after scan disposal", () => {
    let listener: ((value: number) => void) | undefined;
    const reducer = vi.fn((acc: number, value: number) => acc + value);
    const source = {
      subscribe(fn: (value: number) => void) {
        listener = fn;
        return () => {};
      },
    };

    const [readTotal, dispose] = scan(source, 0, reducer);

    listener?.(1);
    expect(readTotal()).toBe(1);

    dispose();
    listener?.(5);

    expect(readTotal()).toBe(1);
    expect(reducer).toHaveBeenCalledTimes(1);
  });
});
