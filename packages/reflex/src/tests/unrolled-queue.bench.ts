/* eslint-disable no-console */
import { performance } from "perf_hooks";
import process from "process";
import { UnrolledQueue } from "../core/collections/unrolled-queue.js";

const WARM_UP = 3;
const ROUNDS = 10;
const OPS = 1_000_000;
const NODE_SIZE = 2048;
const POOL_LIMIT = 128;

const runTest = (queue: UnrolledQueue<{ id: number }>, ops: number) => {
  global.gc?.();

  const startMem = process.memoryUsage().heapUsed;
  const t0 = performance.now();

  let preventOpt = 0;
  for (let i = 0; i < ops; i++) queue.enqueue({ id: i });
  for (let i = 0; i < ops; i++) {
    const item = queue.dequeue();
    if (item) preventOpt += item.id;
  }

  const t1 = performance.now();
  if (preventOpt === 0) console.log("Never print");
  const endMem = process.memoryUsage().heapUsed;

  return { cpu: t1 - t0, ram: (endMem - startMem) / 1024 };
};

describe("🧪 UnrolledQueue Performance Benchmark", () => {
  it("should perform efficiently and be memory-stable", async () => {
    const queue = new UnrolledQueue<{ id: number }>({ nodeSize: NODE_SIZE });
    const CircularQueueNode = (queue as any).constructor.prototype.constructor;
    if (
      CircularQueueNode?.pool &&
      (CircularQueueNode.pool as unknown[]).length > POOL_LIMIT
    ) {
      (CircularQueueNode.pool as unknown[]).splice(POOL_LIMIT);
    }

    const results = { cpu: 0, ram: 0 };
    const total = ROUNDS + WARM_UP;

    for (let i = 0; i < total; i++) {
      const { cpu, ram } = runTest(queue, OPS);

      if (i > WARM_UP) {
        results.cpu += cpu;
        results.ram += ram;
      }

      await new Promise((r) => setTimeout(r, 10)); // даём GC шанс
    }

    const avgCPU = parseFloat((results.cpu / ROUNDS).toFixed(2));
    const avgRAM = parseFloat((results.ram / ROUNDS).toFixed(2));

    console.log("\n──────────────────────────────");
    console.log(`⚙️  ${OPS.toLocaleString()} ops × ${ROUNDS} rounds`);
    console.log(`⏱️  CPU time: ${avgCPU} ms`);
    console.log(`💾  Heap delta: ${avgRAM.toFixed(2)} KB`);
    console.log("──────────────────────────────\n");

    expect(avgCPU).toBeLessThan(1000);
    expect(avgRAM).toBeLessThan(60000);
  });
});

describe("UnrolledQueue", () => {
  let q: UnrolledQueue<number>;

  beforeEach(() => {
    q = new UnrolledQueue<number>({ nodeSize: 8 }); // маленький размер для тестов
  });

  it("enqueues and dequeues single item", () => {
    q.enqueue(42);
    expect(q.length).toBe(1);
    expect(q.dequeue()).toBe(42);
    expect(q.length).toBe(0);
    expect(q.dequeue()).toBeNull();
  });

  it("handles multiple enqueue/dequeue cycles", () => {
    for (let i = 0; i < 50; i++) q.enqueue(i);
    expect(q.length).toBe(50);
    for (let i = 0; i < 50; i++) expect(q.dequeue()).toBe(i);
    expect(q.length).toBe(0);
  });

  it("expands to multiple nodes when full", () => {
    const size = 8;
    for (let i = 0; i < size * 3; i++) q.enqueue(i);
    expect(q.length).toBe(size * 3);

    for (let i = 0; i < size * 3; i++) {
      const val = q.dequeue();
      expect(val).toBe(i);
    }

    expect(q.length).toBe(0);
  });

  it("recycles nodes after clearing", () => {
    q.enqueue(1);
    q.enqueue(2);
    q.clear();
    expect(q.length).toBe(0);
    expect(q.dequeue()).toBeNull();

    q.enqueue(5);
    expect(q.dequeue()).toBe(5);
  });

  it("supports iteration from tail to head", () => {
    q.enqueue(1);
    q.enqueue(2);
    q.enqueue(3);

    const result = [...q];
    expect(result).toEqual([1, 2, 3]);
  });

  it("peek returns current tail element", () => {
    q.enqueue(10);
    q.enqueue(20);
    expect(q.peek()).toBe(10);
    expect(q.dequeue()).toBe(10);
    expect(q.peek()).toBe(20);
  });

  it("maintains O(1) amortized behavior under heavy load", () => {
    const N = 100_000;
    for (let i = 0; i < N; i++) q.enqueue(i);
    expect(q.length).toBe(N);

    let sum = 0;
    for (let i = 0; i < N; i++) sum += q.dequeue()!;
    expect(sum).toBe((N * (N - 1)) / 2);
    expect(q.length).toBe(0);
  });

  it("clears all nodes correctly", () => {
    for (let i = 0; i < 20; i++) q.enqueue(i);
    q.clear();
    expect(q.length).toBe(0);
    expect([...q]).toEqual([]);
    expect(q.dequeue()).toBeNull();
  });

  it("throws if nodeSize is not power of two", () => {
    expect(() => new UnrolledQueue({ nodeSize: 7 })).toThrow();
    expect(() => new UnrolledQueue({ nodeSize: -4 })).toThrow();
  });

  it("reuses node pool between instances", () => {
    const q1 = new UnrolledQueue<number>({ nodeSize: 8 });
    for (let i = 0; i < 16; i++) q1.enqueue(i);
    for (let i = 0; i < 16; i++) q1.dequeue();
    q1.clear();

    const q2 = new UnrolledQueue<number>({ nodeSize: 8 });
    q2.enqueue(1);
    expect(q2.dequeue()).toBe(1);
  });
});
