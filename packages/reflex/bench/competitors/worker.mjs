import { PerformanceObserver, performance } from "node:perf_hooks";
import { createSession, FRAMEWORK_LABELS } from "./adapters.mjs";
import {
  getScenario,
  normalizeStats,
  snapshotStats,
  subtractStats,
} from "./scenarios.mjs";

function percentile(sorted, fraction) {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1),
  );
  return sorted[index];
}

const MIN_SAMPLES_FOR_P99 = 100;
// With only 1,000 samples p999 is effectively a single extreme observation.
// Require ten tail observations before publishing that quantile.
const MIN_SAMPLES_FOR_P999 = 10_000;

function errorText(error) {
  return error instanceof Error
    ? (error.stack ?? error.message)
    : String(error);
}

function immediate() {
  return new Promise((resolve) => setImmediate(resolve));
}

function runForMinimum(run, minimumIterations, minimumMilliseconds) {
  const minimumNanoseconds = minimumMilliseconds * 1e6;
  const started = process.hrtime.bigint();
  let operations = 0;
  let elapsedNs = 0;
  do {
    const remaining = Math.max(0, minimumIterations - operations);
    const chunk = remaining > 0 ? Math.min(64, remaining) : 64;
    for (let index = 0; index < chunk; index++) run();
    operations += chunk;
    elapsedNs = Number(process.hrtime.bigint() - started);
  } while (operations < minimumIterations || elapsedNs < minimumNanoseconds);
  return { operations, elapsedNs };
}

function workPhase(before, after, operations) {
  const total = subtractStats(after, before);
  return {
    operations,
    total,
    perOperation: normalizeStats(total, operations),
  };
}

async function main() {
  const request = JSON.parse(process.argv[2]);
  const scenario = getScenario(request.scenario);
  const gc = {
    minorCount: 0,
    majorCount: 0,
    incrementalCount: 0,
    weakCallbackCount: 0,
    totalPauseMs: 0,
    maxPauseMs: 0,
  };
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const kind = entry.detail?.kind;
      if (kind === 1) gc.minorCount++;
      else if (kind === 2) gc.majorCount++;
      else if (kind === 4) gc.incrementalCount++;
      else if (kind === 8) gc.weakCallbackCount++;
      gc.totalPauseMs += entry.duration;
      gc.maxPauseMs = Math.max(gc.maxPauseMs, entry.duration);
    }
  });
  observer.observe({ entryTypes: ["gc"] });

  let session;
  try {
    session = createSession(request.framework, (api) =>
      scenario.setup(api, request.size),
    );
    const workload = session.instance;
    workload.validate();

    const warmup = runForMinimum(
      workload.run,
      request.warmup,
      request.minWarmupMs,
    );
    workload.validate();
    session.api.flush();
    globalThis.gc?.();
    await immediate();

    Object.assign(gc, {
      minorCount: 0,
      majorCount: 0,
      incrementalCount: 0,
      weakCallbackCount: 0,
      totalPauseMs: 0,
      maxPauseMs: 0,
    });
    const beforeThroughputStats = snapshotStats(workload.stats);
    const throughput = runForMinimum(
      workload.run,
      request.iterations,
      request.minThroughputMs,
    );
    const afterThroughputStats = snapshotStats(workload.stats);
    workload.validate();

    const beforeLatencyStats = snapshotStats(workload.stats);
    const latencyNs = new Array(request.latencySamples);
    for (let index = 0; index < request.latencySamples; index++) {
      const started = process.hrtime.bigint();
      workload.run();
      latencyNs[index] = Number(process.hrtime.bigint() - started);
    }
    latencyNs.sort((left, right) => left - right);
    const afterLatencyStats = snapshotStats(workload.stats);
    workload.validate();

    // Give throughput/latency garbage no chance to masquerade as workload
    // retention. The memory phase gets its own post-GC baseline.
    await immediate();
    globalThis.gc?.();
    await immediate();
    const memoryBaseline = process.memoryUsage();
    const beforeMemoryStats = snapshotStats(workload.stats);
    for (let index = 0; index < request.memoryIterations; index++)
      workload.run();
    const afterMemoryStats = snapshotStats(workload.stats);
    const postWorkMemory = process.memoryUsage();
    workload.validate();
    await immediate();
    globalThis.gc?.();
    await immediate();
    const retainedMemory = process.memoryUsage();
    const missingCapabilities = (scenario.requiresCapabilities ?? []).filter(
      (capability) => session.api.capabilities[capability] !== true,
    );
    const throughputWork = workPhase(
      beforeThroughputStats,
      afterThroughputStats,
      throughput.operations,
    );
    const latencyWork = workPhase(
      beforeLatencyStats,
      afterLatencyStats,
      request.latencySamples,
    );
    const memoryWork = workPhase(
      beforeMemoryStats,
      afterMemoryStats,
      request.memoryIterations,
    );

    const result = {
      ok: true,
      framework: request.framework,
      frameworkLabel: FRAMEWORK_LABELS[request.framework],
      scenario: request.scenario,
      group: scenario.group,
      dimension: scenario.dimension ?? "constant",
      size: request.size,
      trial: request.trial,
      node: process.version,
      v8: process.versions.v8,
      platform: `${process.platform}-${process.arch}`,
      pid: process.pid,
      jitless: process.execArgv.includes("--jitless"),
      warmup: warmup.operations,
      requestedWarmup: request.warmup,
      iterations: throughput.operations,
      requestedIterations: request.iterations,
      latencySamples: request.latencySamples,
      memoryIterations: request.memoryIterations,
      throughput: {
        elapsedNs: throughput.elapsedNs,
        nsPerOperation: throughput.elapsedNs / throughput.operations,
        operationsPerSecond:
          (throughput.operations * 1e9) / throughput.elapsedNs,
      },
      latencyNs: {
        sampleCount: request.latencySamples,
        min: latencyNs[0] ?? 0,
        p50: percentile(latencyNs, 0.5),
        p95: percentile(latencyNs, 0.95),
        // A quantile beyond the available sample resolution is deliberately
        // absent. In particular, p99 and p999 both selecting the final sample
        // in a 20-sample smoke run is not evidence about tail latency.
        p99:
          request.latencySamples >= MIN_SAMPLES_FOR_P99
            ? percentile(latencyNs, 0.99)
            : null,
        p999:
          request.latencySamples >= MIN_SAMPLES_FOR_P999
            ? percentile(latencyNs, 0.999)
            : null,
        max: latencyNs.at(-1) ?? 0,
      },
      memory: {
        allocationBytesPerOperation: null,
        heapGrowthBytesPerOperation:
          (postWorkMemory.heapUsed - memoryBaseline.heapUsed) /
          request.memoryIterations,
        // Heap deltas include V8's collection/compaction decisions. They are
        // useful diagnostics, but are intentionally not presented as an
        // allocation count.
        retainedHeapDeltaBytesPerOperation:
          (retainedMemory.heapUsed - memoryBaseline.heapUsed) /
          request.memoryIterations,
        rssBeforeBytes: memoryBaseline.rss,
        // This is a post-work snapshot, not a sampled peak.
        rssPostWorkBytes: postWorkMemory.rss,
        rssAfterGcBytes: retainedMemory.rss,
      },
      gc,
      work: {
        throughput: throughputWork,
        latency: latencyWork,
        memory: memoryWork,
      },
      observableChecksum: workload.stats.checksum,
      capabilities: session.api.capabilities,
      comparison: {
        eligible: missingCapabilities.length === 0,
        missingCapabilities,
        reason:
          missingCapabilities.length === 0
            ? null
            : `Scenario requires ${missingCapabilities.join(", ")} for equal public observable work`,
      },
      metadata: workload.metadata,
    };
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({
        ok: false,
        framework: request.framework,
        frameworkLabel: FRAMEWORK_LABELS[request.framework],
        scenario: request.scenario,
        group: scenario.group,
        dimension: scenario.dimension ?? "constant",
        size: request.size,
        trial: request.trial,
        node: process.version,
        v8: process.versions.v8,
        error: errorText(error),
      })}\n`,
    );
  } finally {
    try {
      session?.dispose();
    } catch (error) {
      process.stderr.write(`dispose failed: ${errorText(error)}\n`);
    }
    observer.disconnect();
  }
}

await main();
