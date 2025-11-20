/**
 * Unrolled-Linked Queue implementation
 *
 * Inspired by Node.js internal FixedQueue but enhanced:
 * - Uses a linked list of fixed-size circular buffer nodes (unrolled queue) instead of one static ring.
 * - On enqueue: if current head node is full → allocate (or reuse from pool) a new node and link it.
 * - On dequeue: if current tail node is emptied and has next → detach it and return it to pool.
 * - Node pooling: detached nodes up to POOL_MAX are kept and reused to reduce GC churn.
 * - Circular buffer inside each node: size is power of two, readIndex/writeIndex wrap via bit-mask for speed.
 * - Iterable: supports iteration from tail → head, enabling full traversal.
 * - Clear/reset support: can recycle all nodes and re-initialize.
 * - Time complexity: amortised O(1) for enqueue/dequeue; memory footprint adapts dynamically.
 *
 * Typical use cases:
 * - High-throughput runtime/event queues.
 * - Scenarios where GC pressure must be minimised.
 * - Systems demanding predictable, low-latency enqueue/dequeue operations.
 *
 * Note: For maximum performance, pick nodeSize as power of two (e.g., 1024, 2048).
 * 
 */

import { bench, describe } from "vitest";
import { performance } from "node:perf_hooks";
import { UnrolledQueue } from "../../src/core/collections/unrolled-queue";

interface BenchOptions {
  ops: number;
  rounds: number;
  warmup: number;
  nodeSize: number;
  poolSize?: number;
}

function memoryUsageMB() {
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

function runSingleRound(QueueCtor: typeof UnrolledQueue, opts: BenchOptions) {
  const q = new QueueCtor({ nodeSize: opts.nodeSize });

  // Перед измерением — сброс мусора
  if (global.gc) global.gc();

  const memStart = memoryUsageMB();
  const t0 = performance.now();

  let prevent = 0;

  for (let i = 0; i < opts.ops; i++) {
    q.enqueue({ id: i });
  }

  for (let i = 0; i < opts.ops; i++) {
    const item = q.dequeue();
    if (item) prevent += (item as any).id;
  }

  const t1 = performance.now();
  const memEnd = memoryUsageMB();

  if (prevent === 0) console.log("prevent");

  return {
    cpu: t1 - t0,
    ram: memEnd - memStart,
  };
}

function runAveraged(QueueCtor: typeof UnrolledQueue, opts: BenchOptions) {
  const warmup = opts.warmup;
  const rounds = opts.rounds;

  let cpu = 0;
  let ram = 0;

  // Warm-up + real rounds
  for (let i = 0; i < warmup + rounds; i++) {
    const { cpu: c, ram: r } = runSingleRound(QueueCtor, opts);

    if (i >= warmup) {
      cpu += c;
      ram += r;
    }
  }

  return {
    cpu: +(cpu / rounds).toFixed(3),
    ram: +(ram / rounds).toFixed(3),
  };
}

describe("UnrolledQueue — Stress Benchmark (CPU + RAM)", () => {
  const opts: BenchOptions = {
    ops: 200_000,
    rounds: 5,
    warmup: 2,
    nodeSize: 2048,
  };

  bench(`stress: enqueue+dequeue ${opts.ops} ops`, () => {
    const res = runAveraged(UnrolledQueue, opts);
    console.log(
      `\nStress results — ${opts.ops} ops:\n`,
      `CPU(ms): ${res.cpu}\nRAM(MB): ${res.ram}\n`,
    );
  });
});
