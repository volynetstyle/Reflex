import { bench, describe } from "vitest";
import { FourAryHeap } from "./compare/FourAryHeap";

const N = 2048;

const WIDTH = 2048;

describe("FourAryHeap Benchmarks", () => {
  bench("heap insert 2048 random", () => {
    const heap = new FourAryHeap<string>();
    for (let i = 0; i < N; i++) {
      heap.insert(`item${i}`, i);
    }
  });

  bench("heap popMin 2048", () => {
    const heap = new FourAryHeap<string>();

    for (let i = 0; i < N; i++) {
      heap.insert(`item${i}`, i);
    }

    while (!heap.isEmpty()) {
      heap.popMin();
    }
  });

  bench("heap mixed insert + pop", () => {
    const heap = new FourAryHeap<string>();

    for (let i = 0; i < N; i++) {
      heap.insert(`item${i}`, i);

      if (i % 3 === 0 && !heap.isEmpty()) {
        heap.popMin();
      }
    }
  });

});


  describe("FourAryHeap Breadth Benchmarks", () => {
    bench("heap breadth insert (same priority)", () => {
      const heap = new FourAryHeap<string>();

      for (let i = 0; i < WIDTH; i++) {
        heap.insert(`item${i}`, 1);
      }
    });

    bench("heap breadth pop", () => {
      const heap = new FourAryHeap<string>();

      for (let i = 0; i < WIDTH; i++) {
        heap.insert(`item${i}`, 1);
      }

      while (!heap.isEmpty()) {
        heap.popMin();
      }
    });

    bench("heap breadth storm", () => {
      const heap = new FourAryHeap<string>();

      for (let i = 0; i < WIDTH; i++) {
        heap.insert(`item${i}`, 1);
      }

      for (let i = 0; i < WIDTH; i++) {
        heap.popMin();
        heap.insert(`x${i}`, 1);
      }
    });
  });


