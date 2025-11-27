import { describe, it, expect } from "vitest";
import { UnrolledQueue } from "./../../src/collections/unrolled-queue";

describe("UnrolledQueue — correctness", () => {
  it("enqueue/dequeue basic", () => {
    const q = new UnrolledQueue<number>({ nodeSize: 8 });

    q.enqueue(1);
    q.enqueue(2);
    q.enqueue(3);

    expect(q.length).toBe(3);
    expect(q.dequeue()).toBe(1);
    expect(q.dequeue()).toBe(2);
    expect(q.dequeue()).toBe(3);
    expect(q.dequeue()).toBe(undefined);
  });

  it("should correctly unroll into multiple nodes", () => {
    const q = new UnrolledQueue<number>({ nodeSize: 4 }); // 3 usable slots per node

    for (let i = 0; i < 20; i++) q.enqueue(i);

    expect(q.length).toBe(20);

    for (let i = 0; i < 20; i++) {
      expect(q.dequeue()).toBe(i);
    }

    expect(q.length).toBe(0);
    expect(q.dequeue()).toBe(undefined);
  });

  it("supports clearing and node reuse", () => {
    const q = new UnrolledQueue<number>({ nodeSize: 8 });

    for (let i = 0; i < 50; i++) q.enqueue(i);
    q.clear();

    expect(q.length).toBe(0);
    expect(q.dequeue()).toBe(undefined);

    // Reuse after clear
    for (let i = 0; i < 10; i++) q.enqueue(i * 10);

    expect(q.length).toBe(10);

    for (let i = 0; i < 10; i++) {
      expect(q.dequeue()).toBe(i * 10);
    }
  });

  it("peek returns current tail without removing", () => {
    const q = new UnrolledQueue<number>({ nodeSize: 8 });

    expect(q.peek()).toBe(null);

    q.enqueue(10);
    q.enqueue(20);

    expect(q.peek()).toBe(10);
    expect(q.dequeue()).toBe(10);
    expect(q.peek()).toBe(20);
  });

  it("iterator yields items in FIFO order", () => {
    const q = new UnrolledQueue<number>({ nodeSize: 4 });

    for (let i = 0; i < 12; i++) q.enqueue(i);

    const arr = [...q];
    expect(arr.length).toBe(12);
    expect(arr).toEqual([...Array(12).keys()]);
  });

  it("drain processes all values in correct order", () => {
    const q = new UnrolledQueue<number>({ nodeSize: 4 });
    const out: number[] = [];

    for (let i = 0; i < 15; i++) q.enqueue(i);

    const count = q.drain((v) => out.push(v));

    expect(count).toBe(15);
    expect(out).toEqual([...Array(15).keys()]);
    expect(q.length).toBe(0);
  });

  it("estimateNodes returns approximate number", () => {
    const q = new UnrolledQueue<number>({ nodeSize: 8 }); // 7 usable slots

    for (let i = 0; i < 30; i++) q.enqueue(i);

    const est = q.estimateNodes();

    expect(est).toBeGreaterThanOrEqual(4);
    expect(est).toBeLessThanOrEqual(6); // loose bound
  });
});
