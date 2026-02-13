import { bench, describe } from "vitest";
import { UnrolledQueue } from "../../src/collections/unrolled-queue";

describe("UnrolledQueue — Microbench", () => {
  const N = 200_000;

  bench("enqueue N", () => {
    const q = new UnrolledQueue<number>({ nodeSize: 2048 });

    for (let i = 0; i < N; i++) q.enqueue(i);
  });

  bench("enqueue + dequeue N", () => {
    const q = new UnrolledQueue<number>({ nodeSize: 2048 });

    for (let i = 0; i < N; i++) q.enqueue(i);
    for (let i = 0; i < N; i++) q.dequeue();
  });

  bench("mixed workload (50/50)", () => {
    const q = new UnrolledQueue<number>({ nodeSize: 1024 });
    let x = 0;

    for (let i = 0; i < N; i++) {
      if (i & 1) q.enqueue(x++); else q.dequeue();
    }
  });


  bench("iterate over 100k", () => {
    const q = new UnrolledQueue<number>({ nodeSize: 1024 });

    for (let i = 0; i < 100_000; i++) q.enqueue(i);
    for (const _v of q) {}
  });
});
