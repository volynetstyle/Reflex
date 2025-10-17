/* eslint-disable no-console */
import { performance } from "node:perf_hooks";
import process from "node:process";
import { UnrolledQueue } from "./unrolled-queue";

const WARM_UP = 3;
const ROUNDS = 10;
const OPS = 1_000_000;
const NODE_SIZE = 2048;
const POOL_LIMIT = 128;

const runTest = (queue: UnrolledQueue<{ id: number }>, ops: number) => {
  global.gc?.();
  (async () => {
    await new Promise((r) => setTimeout(r, 50));
    console.log(
      "📉 Final heap:",
      process.memoryUsage().heapUsed / 1024 / 1024,
      "MB"
    );
  })();

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
