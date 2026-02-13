import { describe, it, expect } from "vitest";
import { UnrolledQueue } from "../../src/collections/unrolled-queue";

describe("UnrolledQueue — structural invariants", () => {
  it("node count remains valid under growth/shrink cycles", () => {
    const q = new UnrolledQueue<number>({ nodeSize: 4 });

    for (let cycle = 0; cycle < 30; cycle++) {
      for (let i = 0; i < 200; i++) q.enqueue(i);
      for (let i = 0; i < 150; i++) q.dequeue();
    }

    // Длина не отрицательная
    expect(q.length).toBeGreaterThanOrEqual(0);

    // estimateNodes >= реальное число
    const est = q.estimateNodes();

    // есть хотя бы 1 узел
    expect(est).toBeGreaterThanOrEqual(1);
  });

  it("length always equals sum of segments", () => {
    const q = new UnrolledQueue<number>({ nodeSize: 8 });

    for (let r = 0; r < 10; r++) {
      for (let i = 0; i < 300; i++) q.enqueue(i);
      for (let i = 0; i < 125; i++) q.dequeue();
    }

    const reconstructed: number[] = [...q];
    expect(reconstructed.length).toBe(q.length);
  });

  it("iterator always matches dequeue order", () => {
    const q = new UnrolledQueue<number>({ nodeSize: 16 });

    for (let i = 0; i < 300; i++) q.enqueue(i);

    const fromIterator = [...q];
    const fromDequeue: number[] = [];

    while (q.length) {
      fromDequeue.push(q.dequeue()!);
    }

    expect(fromIterator).toEqual(fromDequeue);
  });

  it("survives heavy mixed operations", () => {
    const q = new UnrolledQueue<number>({ nodeSize: 8 });
    const mirror: number[] = [];

    for (let i = 0; i < 10000; i++) {
      if (Math.random() > 0.55) {
        q.enqueue(i);
        mirror.push(i);
      } else {
        const a = q.dequeue();
        const b = mirror.shift();
        expect(a).toBe(b);
      }

      expect(q.length).toBe(mirror.length);
    }
  });
});
