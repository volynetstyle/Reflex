import { describe, expect, it, vi } from "vitest";
import { computed } from "../src/api/derived";
import {
  filter,
  hold,
  map,
  merge,
  scan,
  subscribeOnce,
} from "../src/api/event";
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

  it("subscribeOnce unsubscribes before nested emits run", () => {
    const source = createEvent<number>();
    const seen: number[] = [];

    subscribeOnce(source, (value) => {
      seen.push(value);
      source.emit(value + 1);
    });

    source.emit(1);
    source.emit(10);

    expect(seen).toEqual([1]);
  });

  it("subscribeOnce handles synchronous delivery during subscription", () => {
    const seen: number[] = [];
    let unsubscribeCount = 0;

    const source = {
      subscribe(fn: (value: number) => void) {
        fn(1);

        return () => {
          unsubscribeCount++;
        };
      },
    };

    const dispose = subscribeOnce(source, (value) => {
      seen.push(value);
    });

    expect(seen).toEqual([1]);
    expect(unsubscribeCount).toBe(1);

    dispose();

    expect(unsubscribeCount).toBe(1);
  });

  it("map subscribes lazily and disposes its upstream subscription", () => {
    let listener: ((value: number) => void) | undefined;
    let subscribeCount = 0;
    let unsubscribeCount = 0;

    const source = {
      subscribe(fn: (value: number) => void) {
        subscribeCount++;
        listener = fn;

        return () => {
          unsubscribeCount++;
          listener = undefined;
        };
      },
    };

    const doubled = map(source, (value) => value * 2);

    expect(subscribeCount).toBe(0);

    const seen: number[] = [];
    const dispose = doubled.subscribe((value) => {
      seen.push(value);
    });

    expect(subscribeCount).toBe(1);

    listener?.(2);
    listener?.(4);

    expect(seen).toEqual([4, 8]);

    dispose();

    expect(unsubscribeCount).toBe(1);
    expect(listener).toBeUndefined();
  });

  it("filter forwards only matching values", () => {
    const source = createEvent<number>();
    const evens = filter(source, (value) => value % 2 === 0);
    const seen: number[] = [];

    evens.subscribe((value) => {
      seen.push(value);
    });

    source.emit(1);
    source.emit(2);
    source.emit(3);
    source.emit(4);

    expect(seen).toEqual([2, 4]);
  });

  it("merge forwards values from multiple sources in delivery order", () => {
    const rt = createRuntime();
    const sourceA = rt.event<number>();
    const sourceB = rt.event<string>();
    const combined = merge(
      map(sourceA, (value) => `a${value}`),
      map(sourceB, (value) => `b${value}`),
    );
    const seen: string[] = [];

    combined.subscribe((value) => {
      seen.push(value);
    });

    sourceA.emit(1);
    sourceB.emit("x");
    sourceA.emit(2);
    sourceB.emit("y");

    expect(seen).toEqual(["a1", "bx", "a2", "by"]);
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
