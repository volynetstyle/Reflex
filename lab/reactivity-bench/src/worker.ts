import { PerformanceObserver, constants as perfConstants, performance } from "node:perf_hooks";
import { createApi } from "./adapters/index.js";
import type { GcMetrics, WorkerRequest, WorkerResult } from "./protocol.js";
import type { WorkCounters } from "./types.js";
import { getWorkload } from "./workloads/index.js";

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]!;
}

function subtract(after: WorkCounters, before: WorkCounters): WorkCounters {
  return {
    signalWrites: after.signalWrites - before.signalWrites,
    signalReads: after.signalReads - before.signalReads,
    computedRuns: after.computedRuns - before.computedRuns,
    effectRuns: after.effectRuns - before.effectRuns,
    checksum: after.checksum,
  };
}

async function main(): Promise<void> {
  const raw = process.argv[2];
  if (raw === undefined) throw new Error("Worker request is required");
  const request = JSON.parse(raw) as WorkerRequest;
  const definition = getWorkload(request.workloadId);
  if (!definition.supportedPolicies?.includes(request.policy)) {
    throw new Error(`${definition.id} does not support ${request.policy}`);
  }

  const gc: GcMetrics = { minorCount: 0, majorCount: 0, totalPauseMs: 0, maxPauseMs: 0 };
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const kind = (entry as PerformanceEntry & { detail?: { kind?: number }; kind?: number }).detail?.kind
        ?? (entry as PerformanceEntry & { kind?: number }).kind;
      if (kind === perfConstants.NODE_PERFORMANCE_GC_MINOR) gc.minorCount++;
      if (kind === perfConstants.NODE_PERFORMANCE_GC_MAJOR) gc.majorCount++;
      gc.totalPauseMs += entry.duration;
      gc.maxPauseMs = Math.max(gc.maxPauseMs, entry.duration);
    }
  });
  observer.observe({ entryTypes: ["gc"] });

  const api = createApi(request.framework);
  const workload = definition.setup(api, request.size, request.policy);
  for (let index = 0; index < request.warmup; index++) workload.run();
  api.flush();

  globalThis.gc?.();
  const beforeHeap = process.memoryUsage();
  const beforeCounters = workload.counters();
  const sampleCount = Math.max(1, Math.min(request.samples, request.iterations));
  const perSample = Math.floor(request.iterations / sampleCount);
  const remainder = request.iterations % sampleCount;
  const samples: number[] = [];
  let executed = 0;

  for (let sample = 0; sample < sampleCount; sample++) {
    const count = perSample + (sample < remainder ? 1 : 0);
    const started = performance.now();
    for (let index = 0; index < count; index++) workload.run();
    api.flush();
    samples.push(((performance.now() - started) * 1e6) / count);
    executed += count;
  }

  const afterHeap = process.memoryUsage();
  const afterCounters = workload.counters();
  await new Promise<void>((resolve) => setImmediate(resolve));
  globalThis.gc?.();
  const retainedHeap = process.memoryUsage().heapUsed;
  samples.sort((left, right) => left - right);
  const meanNs = samples.reduce((sum, value) => sum + value, 0) / samples.length;

  const result: WorkerResult = {
    ...request,
    suite: definition.suite,
    sourceGroup: definition.sourceGroup,
    processId: process.pid,
    node: process.version,
    jitless: process.execArgv.includes("--jitless"),
    meanNs,
    p95Ns: percentile(samples, 0.95),
    p99Ns: percentile(samples, 0.99),
    opsPerSecond: 1e9 / meanNs,
    heapDeltaBytesPerOp: (afterHeap.heapUsed - beforeHeap.heapUsed) / executed,
    retainedHeapBytesPerOp: (retainedHeap - beforeHeap.heapUsed) / executed,
    rssAfterBytes: afterHeap.rss,
    counters: subtract(afterCounters, beforeCounters),
    gc,
  };

  workload.dispose();
  observer.disconnect();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
