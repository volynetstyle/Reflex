import { bench, describe } from "vitest";
import { BinaryHeap } from "./compare/binaryHeap";


const N = 2048;

describe("BinaryHeap Benchmarks", () => {
  // bench("Array Insert", () => {
  //   const arr = new Array(1024);

  //   for (let i = 0; i < N; i++) {
  //     arr.push((Math.random() * 1024) | 0);
  //   }
  // });

  bench("heap insert 2048 random", () => {
    const heap = new BinaryHeap<string>();
    for (let i = 0; i < N; i++) {
      heap.insert(`item${i}`, (Math.random() * 1024) | 0);
    }
  });

  bench("heap popMin 2048", () => {
    const heap = new BinaryHeap<string>();
    for (let i = 0; i < N; i++) {
      heap.insert(`item${i}`, (Math.random() * 1024) | 0);
    }
    while (!heap.isEmpty()) {
      heap.popMin();
    }
  });

  bench("heap mixed insert + pop", () => {
    const heap = new BinaryHeap<string>();
    for (let i = 0; i < N; i++) {
      heap.insert(`item${i}`, (Math.random() * 1024) | 0);
      if (i % 3 === 0 && !heap.isEmpty()) {
        heap.popMin();
      }
    }
  });
});
