import { describe, expect, it, vi } from "vitest";
import { computed } from "../src/api/derived";
import { hold, scan } from "../src/api/event";
import { createRuntime } from "./reflex.test_utils";

function createEvent<T>() {
  return createRuntime().event<T>();
}

describe("Reactive system - events", () => {
  it("delivers emitted values in FIFO order", () => {
    const source = createEvent<number>();
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
    const source = createEvent<number>();
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

  it("appends nested emits to the end of the queue in FIFO order", () => {
    const source = createEvent<number>();
    const seen: string[] = [];

    source.subscribe((value) => {
      seen.push(`a${value}`);

      if (value === 1) {
        source.emit(2);
        source.emit(3);
      }
    });

    source.subscribe((value) => {
      seen.push(`b${value}`);
    });

    source.emit(1);

    expect(seen).toEqual(["a1", "b1", "a2", "b2", "a3", "b3"]);
  });

  it("preserves queue order across different event sources", () => {
    const rt = createRuntime();
    const sourceA = rt.event<number>();
    const sourceB = rt.event<string>();
    const seen: string[] = [];

    sourceA.subscribe((value) => {
      seen.push(`a${value}`);

      if (value === 1) {
        sourceB.emit("x");
      }
    });

    sourceA.subscribe((value) => {
      seen.push(`b${value}`);
    });

    sourceB.subscribe((value) => {
      seen.push(`c${value}`);
    });

    sourceA.emit(1);

    expect(seen).toEqual(["a1", "b1", "cx"]);
  });

  it("keeps global FIFO order across multiple sources", () => {
    const rt = createRuntime();
    const sourceA = rt.event<number>();
    const sourceB = rt.event<string>();
    const seen: string[] = [];

    sourceA.subscribe((value) => {
      seen.push(`a${value}`);
    });

    sourceB.subscribe((value) => {
      seen.push(`b${value}`);
    });

    sourceA.emit(1);
    sourceB.emit("x");
    sourceA.emit(2);
    sourceB.emit("y");

    expect(seen).toEqual(["a1", "bx", "a2", "by"]);
  });

  it("does not reenter flush and drains the queue fully", () => {
    const source = createEvent<number>();
    const seen: number[] = [];

    source.subscribe((value) => {
      seen.push(value);

      if (value < 4) {
        source.emit(value + 1);
      }
    });

    source.emit(1);

    expect(seen).toEqual([1, 2, 3, 4]);
  });

  it("self-disposal does not affect later queued events", () => {
    const source = createEvent<number>();
    const seen: string[] = [];

    let disposeA!: () => void;

    disposeA = source.subscribe((value) => {
      seen.push(`a${value}`);

      if (value === 1) {
        disposeA();
        source.emit(2);
      }
    });

    source.subscribe((value) => {
      seen.push(`b${value}`);
    });

    source.emit(1);

    expect(seen).toEqual(["a1", "b1", "b2"]);
  });

  it("skips a subscriber unsubscribed earlier in the same delivery", () => {
    const source = createEvent<number>();
    const seen: string[] = [];

    let disposeB!: () => void;

    source.subscribe((value) => {
      seen.push(`a${value}`);
      disposeB();
    });

    disposeB = source.subscribe((value) => {
      seen.push(`b${value}`);
    });

    source.emit(1);

    expect(seen).toEqual(["a1"]);
  });

  it("exception inside subscriber does not poison dispatcher", () => {
    const source = createEvent<number>();
    const seen: number[] = [];

    source.subscribe((value) => {
      if (value === 1) throw new Error("boom");
      seen.push(value);
    });

    expect(() => source.emit(1)).toThrow("boom");

    source.emit(2);

    expect(seen).toEqual([2]);
  });

  it("scan accumulates values and can feed a computed", () => {
    const source = createEvent<number>();
    const [readTotal] = scan(source, 0, (acc, value) => acc + value);
    const doubled = computed(() => readTotal() * 2);

    source.emit(1);
    source.emit(2);
    source.emit(3);

    expect(readTotal()).toBe(6);
    expect(doubled()).toBe(12);
  });

  it("scan reducer runs once per event and dispose is idempotent", () => {
    const source = createEvent<number>();
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
    const source = createEvent<string>();
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