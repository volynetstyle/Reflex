import { describe, it, expect } from "vitest";
import { QuaternaryHeap } from "../../src/heap";

function drain<T>(heap: QuaternaryHeap<T>): T[] {
  const out: T[] = [];
  while (!heap.isEmpty()) out.push(heap.popMin()!);
  return out;
}

function rand(seed: number) {
  let x = seed;
  return () => (x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

describe("QuaternaryHeap", () => {
  it("initial state", () => {
    const heap = new QuaternaryHeap<number>();

    expect(heap.size()).toBe(0);
    expect(heap.isEmpty()).toBe(true);
    expect(heap.peek()).toBeUndefined();
    expect(heap.popMin()).toBeUndefined();
  });

  it("basic ordering", () => {
    const heap = new QuaternaryHeap<string>();

    heap.insert("c", 3);
    heap.insert("a", 1);
    heap.insert("b", 2);

    expect(heap.peek()).toBe("a");

    expect(drain(heap)).toEqual(["a", "b", "c"]);
  });

  it("duplicates allowed", () => {
    const heap = new QuaternaryHeap<string>();

    heap.insert("a", 1);
    heap.insert("b", 1);

    const out = drain(heap);

    expect(out).toHaveLength(2);
    expect(new Set(out)).toEqual(new Set(["a", "b"]));
  });

  it("negative and infinity priorities", () => {
    const heap = new QuaternaryHeap<string>();

    heap.insert("inf", Infinity);
    heap.insert("ninf", -Infinity);
    heap.insert("zero", 0);

    expect(drain(heap)).toEqual(["ninf", "zero", "inf"]);
  });

  it("clear resets heap", () => {
    const heap = new QuaternaryHeap<number>();

    heap.insert(1, 1);
    heap.insert(2, 2);

    heap.clear();

    expect(heap.size()).toBe(0);
    expect(heap.popMin()).toBeUndefined();

    heap.insert(3, 3);

    expect(heap.popMin()).toBe(3);
  });

  it("heap invariant (random)", () => {
    const heap = new QuaternaryHeap<number>();

    const N = 1000;
    const nums = Array.from({ length: N }, rand(N));

    nums.forEach((p, i) => heap.insert(i, p));

    let prev = -Infinity;

    while (!heap.isEmpty()) {
      const idx = heap.popMin()!;
      const val = nums[idx];

      expect(val).toBeGreaterThanOrEqual(prev);
      prev = val;
    }
  });

  it("capacity growth", () => {
    const heap = new QuaternaryHeap<number>();

    const N = 256;
    for (let i = 0; i < N; i++) heap.insert(i, i); // ascending priorities

    const out = drain(heap);

    // ...
    for (
      let i = 1;
      i < out.length;
      i++ // < not <=
    )
      expect(out[i]).toBeGreaterThanOrEqual(out[i - 1]); // i-1 not i
  });

  it("generic types", () => {
    const heap = new QuaternaryHeap<{ v: number }>();

    heap.insert({ v: 2 }, 2);
    heap.insert({ v: 1 }, 1);

    expect(heap.popMin()).toEqual({ v: 1 });
  });
});
