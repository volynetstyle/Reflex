import { performance } from "node:perf_hooks";
import { getDefaultContext } from "../../build/esm/reactivity/context.js";
import {
  cleanupStaleSources,
  trackRead,
} from "../../build/esm/reactivity/engine/tracking.js";
import {
  CONSUMER_CHANGED,
  PRODUCER_INITIAL_STATE,
} from "../../build/esm/reactivity/shape/ReactiveMeta.js";
import { UNINITIALIZED } from "../../build/esm/reactivity/shape/ReactiveNode.js";
import ReactiveNode from "../../build/esm/reactivity/shape/ReactiveNode.js";
import {
  linkEdge,
  moveIncomingEdgeAfter,
  unlinkDetachedIncomingEdgeSequence,
} from "../../build/esm/reactivity/shape/methods/connect.js";

const runtime = getDefaultContext();

function createProducer(value) {
  return new ReactiveNode(value, null, PRODUCER_INITIAL_STATE);
}

function createConsumer() {
  return new ReactiveNode(UNINITIALIZED, null, CONSUMER_CHANGED);
}

function resetRuntime() {
  runtime.resetState();
  runtime.setHooks({});
}

function warm(fn, iterations) {
  let sink = 0;

  for (let i = 0; i < iterations; i += 1) {
    sink ^= fn(i) & 1;
  }

  return sink;
}

function bench(
  label,
  fn,
  iterations,
  warmup = iterations,
  unitsPerOp = 1,
  unitLabel = "op",
) {
  warm(fn, warmup);

  if (globalThis.gc) globalThis.gc();

  let sink = 0;
  const start = performance.now();

  for (let i = 0; i < iterations; i += 1) {
    sink ^= fn(i) & 1;
  }

  const elapsedMs = performance.now() - start;
  const totalUnits = iterations * unitsPerOp;
  const nsPerUnit = (elapsedMs * 1e6) / totalUnits;
  console.log(`${label}: ${nsPerUnit.toFixed(1)} ns/${unitLabel} | sink=${sink}`);
}

function nthIncomingEdge(node, index) {
  let edge = node.firstIn;

  for (let i = 0; edge !== null && i < index; i += 1) {
    edge = edge.nextIn;
  }

  return edge;
}

function createTrackingProfile() {
  return {
    reads: 0,
    headHits: 0,
    sameEdgeHits: 0,
    nextExpectedHits: 0,
    fallbackScans: 0,
    fallbackFoundExisting: 0,
    fallbackCreatedNew: 0,
    fallbackReorders: 0,
    fallbackScanStepsTotal: 0,
    fallbackScanStepsMax: 0,
  };
}

function createCleanupProfile() {
  return {
    cleanupCalls: 0,
    cleanupNoops: 0,
    cleanupPartialDrops: 0,
    cleanupFullDrops: 0,
    cleanupRemovedEdgesTotal: 0,
    cleanupRemovedEdgesMax: 0,
    cleanupRemovedEdgeSamples: [],
  };
}

function recordCleanupProfile(stats, mode, removedCount) {
  stats.cleanupCalls += 1;
  stats.cleanupRemovedEdgesTotal += removedCount;
  stats.cleanupRemovedEdgesMax = Math.max(
    stats.cleanupRemovedEdgesMax,
    removedCount,
  );
  stats.cleanupRemovedEdgeSamples.push(removedCount);

  switch (mode) {
    case "noop":
      stats.cleanupNoops += 1;
      return;
    case "partial":
      stats.cleanupPartialDrops += 1;
      return;
    case "full":
      stats.cleanupFullDrops += 1;
      return;
    default:
      throw new Error(`Unknown cleanup profile mode: ${mode}`);
  }
}

function percentile(sortedValues, fraction) {
  if (sortedValues.length === 0) return 0;

  const index = Math.min(
    sortedValues.length - 1,
    Math.floor((sortedValues.length - 1) * fraction),
  );
  return sortedValues[index];
}

function round(value, digits = 2) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function summarizeTrackingProfile(stats) {
  const fastPathHits =
    stats.headHits + stats.sameEdgeHits + stats.nextExpectedHits;

  return {
    ...stats,
    fastPathHits,
    fastPathRate: stats.reads === 0 ? 0 : round(fastPathHits / stats.reads, 4),
    fallbackRate:
      stats.reads === 0 ? 0 : round(stats.fallbackScans / stats.reads, 4),
    fallbackAvgScanLen:
      stats.fallbackScans === 0
        ? 0
        : round(stats.fallbackScanStepsTotal / stats.fallbackScans, 2),
  };
}

function summarizeCleanupProfile(stats) {
  const samples = [...stats.cleanupRemovedEdgeSamples].sort((a, b) => a - b);

  return {
    cleanupCalls: stats.cleanupCalls,
    cleanupNoops: stats.cleanupNoops,
    cleanupPartialDrops: stats.cleanupPartialDrops,
    cleanupFullDrops: stats.cleanupFullDrops,
    cleanupRemovedEdgesTotal: stats.cleanupRemovedEdgesTotal,
    cleanupRemovedEdgesMax: stats.cleanupRemovedEdgesMax,
    cleanupRemovedEdgesAvg:
      stats.cleanupCalls === 0
        ? 0
        : round(stats.cleanupRemovedEdgesTotal / stats.cleanupCalls, 2),
    cleanupRemovedEdgesP50: percentile(samples, 0.5),
    cleanupRemovedEdgesP95: percentile(samples, 0.95),
  };
}

function trackReadProfiled(source, consumer, stats) {
  stats.reads += 1;

  const prevEdge = consumer.depsTail;
  if (prevEdge !== null) {
    if (prevEdge.from === source) {
      stats.sameEdgeHits += 1;
      return;
    }

    const nextExpected = prevEdge.nextIn;
    if (nextExpected !== null && nextExpected.from === source) {
      stats.nextExpectedHits += 1;
      consumer.depsTail = nextExpected;
      return;
    }

    stats.fallbackScans += 1;

    let scanSteps = 0;
    for (
      let edge = nextExpected ? nextExpected.nextIn : consumer.firstIn;
      edge !== null;
      edge = edge.nextIn
    ) {
      scanSteps += 1;
      if (edge.from !== source) continue;

      stats.fallbackFoundExisting += 1;
      stats.fallbackScanStepsTotal += scanSteps;
      stats.fallbackScanStepsMax = Math.max(
        stats.fallbackScanStepsMax,
        scanSteps,
      );

      if (edge.prevIn !== prevEdge) {
        stats.fallbackReorders += 1;
        moveIncomingEdgeAfter(edge, consumer, prevEdge);
      }

      consumer.depsTail = edge;
      return;
    }

    stats.fallbackCreatedNew += 1;
    stats.fallbackScanStepsTotal += scanSteps;
    stats.fallbackScanStepsMax = Math.max(
      stats.fallbackScanStepsMax,
      scanSteps,
    );
    consumer.depsTail = linkEdge(source, consumer, prevEdge);
    return;
  }

  const firstIn = consumer.firstIn;
  if (firstIn !== null && firstIn.from === source) {
    stats.headHits += 1;
    consumer.depsTail = firstIn;
    return;
  }

  stats.fallbackScans += 1;

  let scanSteps = 0;
  for (let edge = firstIn; edge !== null; edge = edge.nextIn) {
    scanSteps += 1;
    if (edge.from !== source) continue;

    stats.fallbackFoundExisting += 1;
    stats.fallbackScanStepsTotal += scanSteps;
    stats.fallbackScanStepsMax = Math.max(
      stats.fallbackScanStepsMax,
      scanSteps,
    );

    if (edge.prevIn !== null) {
      stats.fallbackReorders += 1;
      moveIncomingEdgeAfter(edge, consumer, null);
    }

    consumer.depsTail = edge;
    return;
  }

  stats.fallbackCreatedNew += 1;
  stats.fallbackScanStepsTotal += scanSteps;
  stats.fallbackScanStepsMax = Math.max(
    stats.fallbackScanStepsMax,
    scanSteps,
  );
  consumer.depsTail = linkEdge(source, consumer, null);
}

function cleanupStaleSourcesProfiled(node, stats) {
  const tail = node.depsTail;
  let staleHead;

  if (tail !== null) {
    staleHead = tail.nextIn;
    if (staleHead === null) {
      recordCleanupProfile(stats, "noop", 0);
      return 0;
    }

    tail.nextIn = null;
    node.lastIn = tail;
  } else {
    staleHead = node.firstIn;
    if (staleHead === null) {
      recordCleanupProfile(stats, "noop", 0);
      return 0;
    }

    node.firstIn = null;
    node.lastIn = null;
  }

  let removedCount = 0;
  for (let edge = staleHead; edge !== null; edge = edge.nextIn) {
    removedCount += 1;
  }

  recordCleanupProfile(stats, tail === null ? "full" : "partial", removedCount);
  unlinkDetachedIncomingEdgeSequence(staleHead);
  return removedCount;
}

function printProfile(label, report) {
  console.log(`${label}:`);
  console.log(JSON.stringify(report, null, 2));
}

function buildStaticTrackingGraph(fanIn) {
  resetRuntime();

  const consumer = createConsumer();
  const sources = [];

  for (let i = 0; i < fanIn; i += 1) {
    const source = createProducer(i);
    sources.push(source);
    linkEdge(source, consumer);
  }

  return { consumer, sources };
}

function buildTrackReadStatic(fanIn) {
  const { consumer, sources } = buildStaticTrackingGraph(fanIn);

  return {
    fanIn,
    run() {
      runtime.activeComputed = consumer;
      consumer.depsTail = null;

      for (let i = 0; i < sources.length; i += 1) {
        trackRead(sources[i]);
      }

      cleanupStaleSources(consumer);
      runtime.activeComputed = null;
      return consumer.depsTail === consumer.lastIn ? fanIn : 0;
    },
    profile(iterations) {
      const tracking = createTrackingProfile();
      const cleanup = createCleanupProfile();

      for (let iteration = 0; iteration < iterations; iteration += 1) {
        runtime.activeComputed = consumer;
        consumer.depsTail = null;

        for (let i = 0; i < sources.length; i += 1) {
          trackReadProfiled(sources[i], consumer, tracking);
        }

        cleanupStaleSourcesProfiled(consumer, cleanup);
        runtime.activeComputed = null;
      }

      return {
        fanIn,
        iterations,
        tracking: summarizeTrackingProfile(tracking),
        cleanup: summarizeCleanupProfile(cleanup),
      };
    },
  };
}

function buildTrackReadRotate(fanIn) {
  const { consumer, sources } = buildStaticTrackingGraph(fanIn);
  let offset = 0;

  return {
    fanIn,
    run() {
      offset = (offset + 1) % fanIn;
      runtime.activeComputed = consumer;
      consumer.depsTail = null;

      for (let i = 0; i < sources.length; i += 1) {
        trackRead(sources[(i + offset) % fanIn]);
      }

      cleanupStaleSources(consumer);
      runtime.activeComputed = null;
      return consumer.depsTail === consumer.lastIn ? offset & 1 : 0;
    },
    profile(iterations) {
      const tracking = createTrackingProfile();
      const cleanup = createCleanupProfile();

      for (let iteration = 0; iteration < iterations; iteration += 1) {
        offset = (offset + 1) % fanIn;
        runtime.activeComputed = consumer;
        consumer.depsTail = null;

        for (let i = 0; i < sources.length; i += 1) {
          trackReadProfiled(sources[(i + offset) % fanIn], consumer, tracking);
        }

        cleanupStaleSourcesProfiled(consumer, cleanup);
        runtime.activeComputed = null;
      }

      return {
        fanIn,
        iterations,
        tracking: summarizeTrackingProfile(tracking),
        cleanup: summarizeCleanupProfile(cleanup),
      };
    },
  };
}

function buildCleanupStatic(fanIn) {
  const { consumer } = buildStaticTrackingGraph(fanIn);

  return {
    run() {
      consumer.depsTail = consumer.lastIn;
      cleanupStaleSources(consumer);
      return consumer.lastIn !== null ? 1 : 0;
    },
  };
}

function buildCleanupProfile(fanIn, keepCount) {
  if (keepCount < 0 || keepCount > fanIn) {
    throw new Error(`keepCount must be between 0 and ${fanIn}`);
  }

  return {
    fanIn,
    keepCount,
    profile(iterations) {
      const cleanup = createCleanupProfile();

      for (let iteration = 0; iteration < iterations; iteration += 1) {
        const { consumer } = buildStaticTrackingGraph(fanIn);

        consumer.depsTail =
          keepCount === 0 ? null : nthIncomingEdge(consumer, keepCount - 1);

        cleanupStaleSourcesProfiled(consumer, cleanup);
      }

      return {
        fanIn,
        keepCount,
        iterations,
        cleanup: summarizeCleanupProfile(cleanup),
      };
    },
  };
}

function runBenchSuite() {
  const static32 = buildTrackReadStatic(32);
  const static8 = buildTrackReadStatic(8);
  const static64 = buildTrackReadStatic(64);
  const static512 = buildTrackReadStatic(512);
  const rotate32 = buildTrackReadRotate(32);
  const rotate64 = buildTrackReadRotate(64);
  const cleanup32 = buildCleanupStatic(32);
  const cleanup8 = buildCleanupStatic(8);
  const cleanup512 = buildCleanupStatic(512);

  bench("trackRead_static_32", () => static32.run(), 150000, 75000, static32.fanIn, "read");
  bench("trackRead_static_8", () => static8.run(), 200000, 100000, static8.fanIn, "read");
  bench("trackRead_static_64", () => static64.run(), 100000, 50000, static64.fanIn, "read");
  bench("trackRead_static_512", () => static512.run(), 20000, 10000, static512.fanIn, "read");
  bench("trackRead_rotate_32", () => rotate32.run(), 40000, 20000, rotate32.fanIn, "read");
  bench("trackRead_rotate_64", () => rotate64.run(), 20000, 10000, rotate64.fanIn, "read");
  bench("cleanup_noop_32", () => cleanup32.run(), 300000, 100000);
  bench("cleanup_static_8", () => cleanup8.run(), 300000, 100000);
  bench("cleanup_static_512", () => cleanup512.run(), 300000, 100000);
}

function runScenario(name) {
  switch (name) {
    case "trackRead_static_32": {
      const scenario = buildTrackReadStatic(32);
      bench(name, () => scenario.run(), 150000, 75000, scenario.fanIn, "read");
      return;
    }
    case "trackRead_static_64": {
      const scenario = buildTrackReadStatic(64);
      bench(name, () => scenario.run(), 100000, 50000, scenario.fanIn, "read");
      return;
    }
    case "trackRead_static_512": {
      const scenario = buildTrackReadStatic(512);
      bench(name, () => scenario.run(), 20000, 10000, scenario.fanIn, "read");
      return;
    }
    case "trackRead_rotate_64": {
      const scenario = buildTrackReadRotate(64);
      bench(name, () => scenario.run(), 20000, 10000, scenario.fanIn, "read");
      return;
    }
    case "trackRead_rotate_32": {
      const scenario = buildTrackReadRotate(32);
      bench(name, () => scenario.run(), 40000, 20000, scenario.fanIn, "read");
      return;
    }
    case "cleanup_noop_32": {
      const scenario = buildCleanupStatic(32);
      bench(name, () => scenario.run(), 300000, 100000);
      return;
    }
    case "cleanup_static_512": {
      const scenario = buildCleanupStatic(512);
      bench(name, () => scenario.run(), 300000, 100000);
      return;
    }
    default:
      throw new Error(`Unknown scenario: ${name}`);
  }
}

function runProfileScenario(name, iterations = 10000) {
  switch (name) {
    case "trackRead_static_32": {
      const scenario = buildTrackReadStatic(32);
      printProfile(name, scenario.profile(iterations));
      return;
    }
    case "trackRead_rotate_32": {
      const scenario = buildTrackReadRotate(32);
      printProfile(name, scenario.profile(iterations));
      return;
    }
    case "cleanup_noop_32": {
      const scenario = buildCleanupProfile(32, 32);
      printProfile(name, scenario.profile(iterations));
      return;
    }
    case "cleanup_drop16of32": {
      const scenario = buildCleanupProfile(32, 16);
      printProfile(name, scenario.profile(iterations));
      return;
    }
    case "cleanup_dropAll32": {
      const scenario = buildCleanupProfile(32, 0);
      printProfile(name, scenario.profile(iterations));
      return;
    }
    default:
      throw new Error(`Unknown profile scenario: ${name}`);
  }
}

function main() {
  const mode = process.argv[2] ?? "bench";

  if (mode === "bench") {
    runBenchSuite();
    return;
  }

  if (mode === "scenario") {
    const name = process.argv[3];
    if (!name) throw new Error("scenario name is required");
    runScenario(name);
    return;
  }

  if (mode === "profile") {
    const name = process.argv[3];
    if (!name) throw new Error("profile scenario name is required");

    const iterations = Number(process.argv[4] ?? "10000");
    if (!Number.isFinite(iterations) || iterations <= 0) {
      throw new Error("profile iterations must be a positive number");
    }

    runProfileScenario(name, Math.trunc(iterations));
    return;
  }

  throw new Error(`Unknown mode: ${mode}`);
}

main();
