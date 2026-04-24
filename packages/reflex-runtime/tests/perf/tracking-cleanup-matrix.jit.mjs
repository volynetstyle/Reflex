import { performance } from "node:perf_hooks";
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
  unlinkEdge,
} from "../../build/esm/reactivity/shape/methods/connect.js";

const TRACKING_POLICIES = [
  {
    id: "reorder_always",
    canonicalPrefix: true,
    wrappedSearch: false,
  },
  {
    id: "find_only",
    canonicalPrefix: false,
    wrappedSearch: true,
  },
];

const CLEANUP_POLICIES = [
  {
    id: "eager_suffix_unlink",
    class: "canonical_graph",
    requiresCanonicalPrefix: true,
  },
  {
    id: "lazy_stale_mark",
    class: "precise_graph",
    retention: "unbounded",
  },
  {
    id: "lazy_stale_mark_bounded_age",
    class: "precise_graph",
    retention: "bounded_age",
  },
  {
    id: "lazy_stale_mark_budgeted",
    class: "precise_graph",
    retention: "budgeted",
  },
  {
    id: "lazy_stale_mark_suffix_assist",
    class: "precise_graph",
    retention: "suffix_assist",
  },
  {
    id: "lazy_stale_mark_versioned_skip",
    class: "precise_graph",
    retention: "versioned_skip",
    candidate: "primary_precise",
  },
  {
    id: "bounded_stale_retention",
    class: "precise_graph",
    retention: "bounded",
  },
  {
    id: "deferred_unlink",
    class: "producer_slack_graph",
    retention: "deferred_queue",
  },
  {
    id: "batched_detach",
    class: "producer_slack_graph",
    retention: "batched_queue",
  },
];

const TRACKING_POLICY_MAP = new Map(
  TRACKING_POLICIES.map((policy) => [policy.id, policy]),
);
const CLEANUP_POLICY_MAP = new Map(
  CLEANUP_POLICIES.map((policy) => [policy.id, policy]),
);

const DEFAULT_COMPARE_WORKLOADS = [
  "rotate",
  "mixed",
  "oscillate_rotate_branch",
  "branch_half",
  "stable_then_drop",
];

const WORKLOAD_KINDS = new Set([
  "rotate",
  "mixed",
  "oscillate_rotate_branch",
  "branch_half",
  "stable_then_drop",
]);

function createProducer(value) {
  return new ReactiveNode(value, null, PRODUCER_INITIAL_STATE);
}

function createConsumer() {
  return new ReactiveNode(UNINITIALIZED, null, CONSUMER_CHANGED);
}

function round(value, digits = 2) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function warm(fn, iterations) {
  let sink = 0;

  for (let i = 0; i < iterations; i += 1) {
    sink ^= fn(i) & 1;
  }

  return sink;
}

function benchScenario(
  label,
  fn,
  iterations,
  warmup,
  totalReadsPerScenario,
  passCount,
) {
  warm(fn, warmup);

  if (globalThis.gc) globalThis.gc();

  let sink = 0;
  const start = performance.now();

  for (let i = 0; i < iterations; i += 1) {
    sink ^= fn(i) & 1;
  }

  const elapsedMs = performance.now() - start;
  const totalReads = iterations * totalReadsPerScenario;
  const totalPasses = iterations * passCount;
  const nsPerRead = (elapsedMs * 1e6) / totalReads;
  const nsPerPass = (elapsedMs * 1e6) / totalPasses;
  console.log(
    `${label}: ${nsPerRead.toFixed(1)} ns/read | ${nsPerPass.toFixed(1)} ns/pass | sink=${sink}`,
  );
}

function createBaseOrder(fanIn) {
  const indices = new Array(fanIn);

  for (let i = 0; i < fanIn; i += 1) {
    indices[i] = i;
  }

  return indices;
}

function createRotations(fanIn) {
  const rotations = new Array(fanIn);

  for (let offset = 0; offset < fanIn; offset += 1) {
    const indices = new Array(fanIn);

    for (let i = 0; i < fanIn; i += 1) {
      indices[i] = (i + offset) % fanIn;
    }

    rotations[offset] = indices;
  }

  return rotations;
}

function getBranchCount(fanIn) {
  return Math.max(1, Math.floor(fanIn / 2));
}

function getDropCount(fanIn) {
  return Math.max(1, Math.floor(fanIn / 2));
}

function getDefaultPhaseLength(kind) {
  switch (kind) {
    case "mixed":
    case "branch_half":
      return 8;
    case "oscillate_rotate_branch":
    case "stable_then_drop":
      return 20;
    default:
      return 0;
  }
}

function getDefaultPassCount(kind, fanIn, phaseLength) {
  const basePasses = fanIn <= 32 ? 160 : fanIn <= 64 ? 128 : 96;
  if (phaseLength > 0) {
    return Math.max(basePasses, phaseLength * 8);
  }
  if (kind === "rotate") {
    return Math.max(basePasses, fanIn * 2);
  }
  return basePasses;
}

function getDefaultBenchmarkIterations(fanIn) {
  if (fanIn <= 16) return 500;
  if (fanIn <= 32) return 300;
  if (fanIn <= 64) return 150;
  return 75;
}

function createWorkloadConfig(
  kind,
  fanIn,
  phaseLength = getDefaultPhaseLength(kind),
  passCount = getDefaultPassCount(kind, fanIn, phaseLength),
) {
  if (!WORKLOAD_KINDS.has(kind)) {
    throw new Error(`Unknown workload kind: ${kind}`);
  }

  return {
    benchmarkIterations: getDefaultBenchmarkIterations(fanIn),
    fanIn,
    kind,
    passCount,
    phaseLength,
    warmupIterations: Math.max(
      20,
      Math.floor(getDefaultBenchmarkIterations(fanIn) / 3),
    ),
  };
}

function createReadPlanner(config) {
  const baseOrder = createBaseOrder(config.fanIn);
  const rotations = createRotations(config.fanIn);
  const branchCount = getBranchCount(config.fanIn);
  const firstHalf = baseOrder.slice(0, branchCount);
  const secondHalf = baseOrder.slice(branchCount);
  const retainedOrder = baseOrder.slice(0, config.fanIn - getDropCount(config.fanIn));
  let branchToggle = false;
  let iteration = 0;
  let offset = 0;

  return function getReadIndices() {
    switch (config.kind) {
      case "rotate":
        offset = (offset + 1) % config.fanIn;
        return rotations[offset];
      case "mixed":
        if (iteration !== 0 && iteration % config.phaseLength === 0) {
          offset = (offset + 1) % config.fanIn;
        }
        iteration += 1;
        return rotations[offset];
      case "oscillate_rotate_branch": {
        const phase = Math.floor(iteration / config.phaseLength) % 2;
        const current =
          phase === 0
            ? rotations[(iteration + 1) % config.fanIn]
            : branchToggle
              ? secondHalf
              : firstHalf;
        if (phase === 1) {
          branchToggle = !branchToggle;
        }
        iteration += 1;
        return current;
      }
      case "branch_half":
        if (iteration !== 0 && iteration % config.phaseLength === 0) {
          branchToggle = !branchToggle;
        }
        iteration += 1;
        return branchToggle ? secondHalf : firstHalf;
      case "stable_then_drop": {
        const cycleLength = config.phaseLength + 1;
        const phaseIndex = iteration % cycleLength;
        iteration += 1;
        return phaseIndex === config.phaseLength ? retainedOrder : baseOrder;
      }
      default:
        throw new Error(`Unknown workload kind: ${config.kind}`);
    }
  };
}

function buildWorkloadPlan(config) {
  const getReadIndices = createReadPlanner(config);
  const passes = new Array(config.passCount);
  let totalReads = 0;

  for (let pass = 0; pass < config.passCount; pass += 1) {
    const indices = getReadIndices().slice();
    passes[pass] = indices;
    totalReads += indices.length;
  }

  const lastPass = passes[passes.length - 1];
  const expectedLiveSet = new Uint8Array(config.fanIn);

  for (let i = 0; i < lastPass.length; i += 1) {
    expectedLiveSet[lastPass[i]] = 1;
  }

  return {
    expectedLiveCount: lastPass.length,
    expectedLiveSet,
    lastPass,
    passes,
    totalReads,
  };
}

function createStrategyId(trackingId, cleanupId) {
  return `${trackingId}+${cleanupId}`;
}

function getValidStrategies() {
  const strategies = [];

  for (const tracking of TRACKING_POLICIES) {
    for (const cleanup of CLEANUP_POLICIES) {
      if (cleanup.requiresCanonicalPrefix && !tracking.canonicalPrefix) {
        continue;
      }

      strategies.push({
        cleanup,
        id: createStrategyId(tracking.id, cleanup.id),
        tracking,
      });
    }
  }

  return strategies;
}

function resolveStrategy(trackingId, cleanupId) {
  const tracking = TRACKING_POLICY_MAP.get(trackingId);
  const cleanup = CLEANUP_POLICY_MAP.get(cleanupId);

  if (!tracking) {
    throw new Error(`Unknown tracking policy: ${trackingId}`);
  }
  if (!cleanup) {
    throw new Error(`Unknown cleanup policy: ${cleanupId}`);
  }
  if (cleanup.requiresCanonicalPrefix && !tracking.canonicalPrefix) {
    throw new Error(
      `${cleanupId} requires canonical prefix tracking and cannot be paired with ${trackingId}`,
    );
  }

  return {
    cleanup,
    id: createStrategyId(trackingId, cleanupId),
    tracking,
  };
}

function createTrackingStats() {
  return {
    fallbackCreatedNew: 0,
    fallbackFoundExisting: 0,
    fallbackReorders: 0,
    fallbackScans: 0,
    fallbackScanStepsMax: 0,
    fallbackScanStepsTotal: 0,
    headHits: 0,
    reads: 0,
    reactivatedStaleEdges: 0,
    recomputes: 0,
    sameEdgeHits: 0,
    nextExpectedHits: 0,
    wrappedResolvedCount: 0,
  };
}

function createCleanupStats(strategy, fanIn) {
  return {
    ageBoundConfig:
      strategy.cleanup.id === "lazy_stale_mark_bounded_age"
        ? {
            maxStaleAge: 2,
          }
        : null,
    batchConfig:
      strategy.cleanup.id === "batched_detach"
        ? {
            maxDeferredEdges: fanIn,
          }
        : null,
    budgetConfig:
      strategy.cleanup.id === "lazy_stale_mark_budgeted"
        ? {
            maxUnlinksPerPass: Math.max(1, Math.floor(fanIn / 4)),
          }
        : null,
    boundedConfig:
      strategy.cleanup.id === "bounded_stale_retention"
        ? {
            maxStaleEdges: fanIn,
            maxStaleToLiveRatio: 1,
          }
        : null,
    cleanupClass: strategy.cleanup.class,
    cleanupPolicy: strategy.cleanup.id,
    ageBoundRemovedTotal: 0,
    assistFallbackCount: 0,
    assistHitCount: 0,
    assistMaintenanceCost: 0,
    assistVisitedTotal: 0,
    budgetLimitedPasses: 0,
    budgetedRemovedTotal: 0,
    budgetUsedTotal: 0,
    deferredFlushCount: 0,
    deferredFlushRemovedTotal: 0,
    deferredFlushVisitedTotal: 0,
    deferredQueuePeak: 0,
    forcedDrainCalls: 0,
    forcedDrainRemovedTotal: 0,
    forcedDrainVisitedTotal: 0,
    lazyMarkedStaleTotal: 0,
    peakStaleAge: 0,
    peakStaleEdges: 0,
    peakStaleToLiveRatio: 0,
    peakTotalEdges: fanIn,
    peakTransientStaleEdges: 0,
    peakTransientStaleToLiveRatio: 0,
    preciseCleanupPasses: 0,
    staleAgeAtRemovalMax: 0,
    staleAgeRemovalHistogram: {
      age1: 0,
      age2plus: 0,
    },
    sweepRemovedTotal: 0,
    sweepTriggeredCount: 0,
    sweepVisitedTotal: 0,
    totalCleanupCalls: 0,
    totalCleanupRemoved: 0,
    totalCleanupVisited: 0,
    versionedPostSkipCleanupCount: 0,
    versionedPostSkipCleanupVisited: 0,
    versionedSkipBlockedByStaleDebt: 0,
    versionedSkipBlockedByUntouchedEdges: 0,
    versionedSkipCount: 0,
    versionedSkipSavedVisited: 0,
  };
}

function createGraphState(fanIn) {
  return {
    deferredEdgeCount: 0,
    deferredQueue: [],
    previousVersionedSkip: false,
    staleSegmentHead: null,
    staleEdgeCount: 0,
    totalEdgeCount: fanIn,
  };
}

function createLifecycleStats(config, strategy) {
  return {
    cleanup: createCleanupStats(strategy, config.fanIn),
    drains: {
      equivalentAfterDrain: false,
      forcedDrainCost: 0,
      missingLiveEdges: 0,
      residualStaleEdges: 0,
      unexpectedLiveEdges: 0,
      verifiedLiveEdges: 0,
    },
    horizon: {
      avgCleanupVisitedPerPass: 0,
      avgLiveEdgesPerPass: 0,
      avgStaleEdgesPerPass: 0,
      hotPasses: config.passCount,
      passConsistencyFailures: 0,
      totalCleanupWork: 0,
      totalReads: 0,
      totalScanWork: 0,
      totalWorkWithDrain: 0,
    },
    strategy: {
      cleanupClass: strategy.cleanup.class,
      cleanupPolicy: strategy.cleanup.id,
      id: strategy.id,
      trackingPolicy: strategy.tracking.id,
    },
    timing: null,
    tracking: createTrackingStats(),
    workload: {
      fanIn: config.fanIn,
      kind: config.kind,
      passCount: config.passCount,
      phaseLength: config.phaseLength || null,
    },
  };
}

function summarizeTrackingStats(stats) {
  const fastPathHits =
    stats.headHits + stats.sameEdgeHits + stats.nextExpectedHits;

  return {
    ...stats,
    fallbackAvgScanLen:
      stats.fallbackScans === 0
        ? 0
        : round(stats.fallbackScanStepsTotal / stats.fallbackScans, 2),
    fallbackRate:
      stats.reads === 0 ? 0 : round(stats.fallbackScans / stats.reads, 4),
    fastPathHits,
    fastPathRate: stats.reads === 0 ? 0 : round(fastPathHits / stats.reads, 4),
    readsPerRecompute:
      stats.recomputes === 0 ? 0 : round(stats.reads / stats.recomputes, 2),
    wrappedResolvedRate:
      stats.reads === 0 ? 0 : round(stats.wrappedResolvedCount / stats.reads, 4),
  };
}

function summarizeCleanupStats(stats, passCount) {
  return {
    ...stats,
    avgAgeBoundRemoved:
      passCount === 0 ? 0 : round(stats.ageBoundRemovedTotal / passCount, 2),
    avgAssistMaintenanceCost:
      passCount === 0 ? 0 : round(stats.assistMaintenanceCost / passCount, 2),
    avgAssistVisited:
      stats.assistHitCount === 0
        ? 0
        : round(stats.assistVisitedTotal / stats.assistHitCount, 2),
    avgBudgetRemoved:
      passCount === 0 ? 0 : round(stats.budgetedRemovedTotal / passCount, 2),
    avgBudgetUsed:
      passCount === 0 ? 0 : round(stats.budgetUsedTotal / passCount, 2),
    avgCleanupVisitedPerPass:
      passCount === 0 ? 0 : round(stats.totalCleanupVisited / passCount, 2),
    avgDeferredFlushVisited:
      stats.deferredFlushCount === 0
        ? 0
        : round(stats.deferredFlushVisitedTotal / stats.deferredFlushCount, 2),
    avgForcedDrainVisited:
      stats.forcedDrainCalls === 0
        ? 0
        : round(stats.forcedDrainVisitedTotal / stats.forcedDrainCalls, 2),
    avgStaleEdgesPeakPerLive:
      stats.peakTotalEdges === 0
        ? 0
        : round(stats.peakStaleEdges / stats.peakTotalEdges, 4),
    assistHitRate:
      stats.totalCleanupCalls === 0
        ? 0
        : round(stats.assistHitCount / stats.totalCleanupCalls, 4),
    avgVersionedPostSkipCleanupVisited:
      stats.versionedPostSkipCleanupCount === 0
        ? 0
        : round(
            stats.versionedPostSkipCleanupVisited /
              stats.versionedPostSkipCleanupCount,
            2,
          ),
    versionedSkipHitRate:
      stats.totalCleanupCalls === 0
        ? 0
        : round(stats.versionedSkipCount / stats.totalCleanupCalls, 4),
    avgSweepVisited:
      stats.sweepTriggeredCount === 0
        ? 0
        : round(stats.sweepVisitedTotal / stats.sweepTriggeredCount, 2),
  };
}

function initEdge(edge) {
  edge.deferred = false;
  edge.mark = 0;
  edge.stale = false;
  edge.staleAge = 0;
}

function createLifecycleGraph(fanIn) {
  const consumer = createConsumer();
  const sources = [];

  for (let i = 0; i < fanIn; i += 1) {
    const source = createProducer(i);
    source.debugIndex = i;
    sources.push(source);
    initEdge(linkEdge(source, consumer));
  }

  return { consumer, sources };
}

function observeGraphMetrics(stats, liveCount, staleCount, totalEdgeCount) {
  const cleanupStats = stats.cleanup;
  const horizon = stats.horizon;
  const staleToLiveRatio =
    liveCount === 0 ? (staleCount === 0 ? 0 : staleCount) : staleCount / liveCount;

  cleanupStats.peakStaleEdges = Math.max(cleanupStats.peakStaleEdges, staleCount);
  cleanupStats.peakTotalEdges = Math.max(cleanupStats.peakTotalEdges, totalEdgeCount);
  cleanupStats.peakStaleToLiveRatio = Math.max(
    cleanupStats.peakStaleToLiveRatio,
    staleToLiveRatio,
  );

  horizon.avgLiveEdgesPerPass += liveCount;
  horizon.avgStaleEdgesPerPass += staleCount;
}

function observeTransientStaleMetrics(cleanupStats, liveCount, staleCount) {
  const staleToLiveRatio =
    liveCount === 0 ? (staleCount === 0 ? 0 : staleCount) : staleCount / liveCount;

  cleanupStats.peakTransientStaleEdges = Math.max(
    cleanupStats.peakTransientStaleEdges,
    staleCount,
  );
  cleanupStats.peakTransientStaleToLiveRatio = Math.max(
    cleanupStats.peakTransientStaleToLiveRatio,
    staleToLiveRatio,
  );
}

function detachIncomingOnly(node, edge) {
  const { prevIn, nextIn } = edge;

  if (prevIn) {
    prevIn.nextIn = nextIn;
  } else {
    node.firstIn = nextIn;
  }

  if (nextIn) {
    nextIn.prevIn = prevIn;
  } else {
    node.lastIn = prevIn;
  }

  if (node.depsTail === edge) {
    node.depsTail = prevIn;
  }

  edge.prevIn = null;
  edge.nextIn = null;
}

function detachOutgoingOnly(edge) {
  const { from, nextOut, prevOut } = edge;

  if (prevOut) {
    prevOut.nextOut = nextOut;
  } else {
    from.firstOut = nextOut;
  }

  if (nextOut) {
    nextOut.prevOut = prevOut;
  } else {
    from.lastOut = prevOut;
  }

  edge.prevOut = null;
  edge.nextOut = null;
}

function clearDetachedEdge(edge) {
  edge.deferred = false;
  edge.from = null;
  edge.mark = 0;
  edge.stale = false;
  edge.staleAge = 0;
  edge.to = null;
}

function findReusableEdge(consumer, source, nextExpected, passVersion, wrappedSearch) {
  let scanSteps = 0;
  const scanStart = nextExpected ? nextExpected.nextIn : consumer.firstIn;

  for (let edge = scanStart; edge !== null; edge = edge.nextIn) {
    scanSteps += 1;
    if (edge.from === source && edge.mark !== passVersion) {
      return { edge, scanSteps, wrappedHit: false };
    }
  }

  if (wrappedSearch && scanStart !== consumer.firstIn) {
    for (let edge = consumer.firstIn; edge !== scanStart; edge = edge.nextIn) {
      scanSteps += 1;
      if (edge.from === source && edge.mark !== passVersion) {
        return { edge, scanSteps, wrappedHit: true };
      }
    }
  }

  return { edge: null, scanSteps, wrappedHit: false };
}

function reactivateEdge(edge, stats, graphState) {
  if (edge.stale) {
    edge.stale = false;
    edge.staleAge = 0;
    graphState.staleEdgeCount -= 1;
    stats.reactivatedStaleEdges += 1;
  }
}

function trackRead(source, consumer, strategy, passState, passVersion, graphState, stats) {
  stats.reads += 1;
  passState.reads += 1;

  const prevEdge = consumer.depsTail;
  if (prevEdge !== null) {
    if (prevEdge.from === source) {
      stats.sameEdgeHits += 1;
      reactivateEdge(prevEdge, stats, graphState);
      if (prevEdge.mark !== passVersion) {
        passState.uniqueTouched += 1;
      }
      prevEdge.mark = passVersion;
      return;
    }

    const nextExpected = prevEdge.nextIn;
    if (nextExpected !== null && nextExpected.from === source) {
      stats.nextExpectedHits += 1;
      reactivateEdge(nextExpected, stats, graphState);
      if (nextExpected.mark !== passVersion) {
        passState.uniqueTouched += 1;
      }
      nextExpected.mark = passVersion;
      consumer.depsTail = nextExpected;
      return;
    }

    stats.fallbackScans += 1;
    const found = findReusableEdge(
      consumer,
      source,
      nextExpected,
      passVersion,
      strategy.tracking.wrappedSearch,
    );

    stats.fallbackScanStepsTotal += found.scanSteps;
    stats.fallbackScanStepsMax = Math.max(
      stats.fallbackScanStepsMax,
      found.scanSteps,
    );
    passState.scanWork += found.scanSteps;

    if (found.edge !== null) {
      stats.fallbackFoundExisting += 1;
      if (found.wrappedHit) {
        stats.wrappedResolvedCount += 1;
      }

      reactivateEdge(found.edge, stats, graphState);
      if (found.edge.mark !== passVersion) {
        passState.uniqueTouched += 1;
      }
      if (
        strategy.tracking.canonicalPrefix &&
        found.edge.prevIn !== prevEdge
      ) {
        stats.fallbackReorders += 1;
        moveIncomingEdgeAfter(found.edge, consumer, prevEdge);
      }

      found.edge.mark = passVersion;
      consumer.depsTail = found.edge;
      return;
    }

    stats.fallbackCreatedNew += 1;
    const edge = linkEdge(source, consumer, prevEdge);
    initEdge(edge);
    passState.uniqueTouched += 1;
    edge.mark = passVersion;
    graphState.totalEdgeCount += 1;
    consumer.depsTail = edge;
    return;
  }

  const firstIn = consumer.firstIn;
  if (firstIn !== null && firstIn.from === source) {
    stats.headHits += 1;
    reactivateEdge(firstIn, stats, graphState);
    if (firstIn.mark !== passVersion) {
      passState.uniqueTouched += 1;
    }
    firstIn.mark = passVersion;
    consumer.depsTail = firstIn;
    return;
  }

  stats.fallbackScans += 1;
  const found = findReusableEdge(
    consumer,
    source,
    firstIn,
    passVersion,
    strategy.tracking.wrappedSearch,
  );

  stats.fallbackScanStepsTotal += found.scanSteps;
  stats.fallbackScanStepsMax = Math.max(
    stats.fallbackScanStepsMax,
    found.scanSteps,
  );
  passState.scanWork += found.scanSteps;

  if (found.edge !== null) {
    stats.fallbackFoundExisting += 1;
    if (found.wrappedHit) {
      stats.wrappedResolvedCount += 1;
    }

    reactivateEdge(found.edge, stats, graphState);
    if (found.edge.mark !== passVersion) {
      passState.uniqueTouched += 1;
    }
    if (
      strategy.tracking.canonicalPrefix &&
      found.edge.prevIn !== null
    ) {
      stats.fallbackReorders += 1;
      moveIncomingEdgeAfter(found.edge, consumer, null);
    }

    found.edge.mark = passVersion;
    consumer.depsTail = found.edge;
    return;
  }

  stats.fallbackCreatedNew += 1;
  const edge = linkEdge(source, consumer, null);
  initEdge(edge);
  passState.uniqueTouched += 1;
  edge.mark = passVersion;
  graphState.totalEdgeCount += 1;
  consumer.depsTail = edge;
}

function cleanupEagerSuffix(node, graphState, stats) {
  const cleanupStats = stats.cleanup;
  cleanupStats.totalCleanupCalls += 1;

  const tail = node.depsTail;
  let staleHead;

  if (tail !== null) {
    staleHead = tail.nextIn;
    if (staleHead === null) {
      observeGraphMetrics(
        stats,
        graphState.totalEdgeCount,
        0,
        graphState.totalEdgeCount,
      );
      return {
        cleanupVisited: 0,
        liveCount: graphState.totalEdgeCount,
        staleCount: 0,
      };
    }

    tail.nextIn = null;
    node.lastIn = tail;
  } else {
    staleHead = node.firstIn;
    if (staleHead === null) {
      observeGraphMetrics(stats, 0, 0, 0);
      return {
        cleanupVisited: 0,
        liveCount: 0,
        staleCount: 0,
      };
    }

    node.firstIn = null;
    node.lastIn = null;
  }

  let removed = 0;
  let visited = 0;

  for (let edge = staleHead; edge !== null; edge = edge.nextIn) {
    removed += 1;
    visited += 1;
  }

  unlinkDetachedIncomingEdgeSequence(staleHead);
  graphState.totalEdgeCount -= removed;
  graphState.staleEdgeCount = 0;
  graphState.staleSegmentHead = null;
  cleanupStats.totalCleanupRemoved += removed;
  cleanupStats.totalCleanupVisited += visited;

  const liveCount = graphState.totalEdgeCount;
  observeGraphMetrics(stats, liveCount, 0, graphState.totalEdgeCount);

  return {
    cleanupVisited: visited,
    liveCount,
    staleCount: 0,
  };
}

function markOrRetainStaleEdges(node, graphState, passVersion, stats) {
  const cleanupStats = stats.cleanup;
  let liveCount = 0;
  let staleCount = 0;
  let visited = 0;
  let newlyStale = 0;
  let firstStaleEdge = null;
  let sawLiveAfterStale = false;

  for (let edge = node.firstIn; edge !== null; edge = edge.nextIn) {
    visited += 1;

    if (edge.mark === passVersion) {
      edge.stale = false;
      edge.staleAge = 0;
      liveCount += 1;
      if (firstStaleEdge !== null) {
        sawLiveAfterStale = true;
      }
      continue;
    }

    if (edge.stale) {
      edge.staleAge += 1;
    } else {
      edge.stale = true;
      edge.staleAge = 1;
      newlyStale += 1;
    }

    if (firstStaleEdge === null) {
      firstStaleEdge = edge;
    }
    cleanupStats.peakStaleAge = Math.max(
      cleanupStats.peakStaleAge,
      edge.staleAge,
    );
    staleCount += 1;
  }

  graphState.staleEdgeCount = staleCount;
  graphState.staleSegmentHead =
    staleCount !== 0 && !sawLiveAfterStale ? firstStaleEdge : null;
  cleanupStats.lazyMarkedStaleTotal += newlyStale;
  cleanupStats.preciseCleanupPasses += 1;
  cleanupStats.assistMaintenanceCost += visited;

  return {
    firstStaleEdge,
    liveCount,
    newlyStale,
    sawLiveAfterStale,
    staleCount,
    visited,
  };
}

function tryCleanupSuffixAssist(node, graphState, passVersion, stats) {
  const cleanupStats = stats.cleanup;
  const staleHead = graphState.staleSegmentHead;

  if (
    staleHead === null ||
    graphState.staleEdgeCount === 0 ||
    node.depsTail === null ||
    node.depsTail.nextIn !== staleHead
  ) {
    cleanupStats.assistFallbackCount += 1;
    return null;
  }

  let edge = staleHead;
  let staleCount = 0;
  let visited = 0;

  while (edge !== null) {
    visited += 1;

    if (edge.mark === passVersion) {
      edge.stale = false;
      edge.staleAge = 0;
    } else {
      edge.stale = true;
      edge.staleAge = Math.max(1, edge.staleAge + 1);
      cleanupStats.peakStaleAge = Math.max(
        cleanupStats.peakStaleAge,
        edge.staleAge,
      );
      staleCount += 1;
    }

    edge = edge.nextIn;
  }

  graphState.staleEdgeCount = staleCount;
  graphState.staleSegmentHead = staleCount === 0 ? null : staleHead;
  cleanupStats.assistHitCount += 1;
  cleanupStats.assistVisitedTotal += visited;

  const liveCount = graphState.totalEdgeCount - staleCount;
  observeTransientStaleMetrics(cleanupStats, liveCount, staleCount);
  cleanupStats.totalCleanupVisited += visited;
  observeGraphMetrics(
    stats,
    liveCount,
    staleCount,
    graphState.totalEdgeCount,
  );

  return {
    cleanupVisited: visited,
    liveCount,
    staleCount,
  };
}

function sweepStaleEdges(node, graphState, cleanupStats) {
  let edge = node.firstIn;
  let removed = 0;
  let visited = 0;

  while (edge !== null) {
    const next = edge.nextIn;
    visited += 1;

    if (edge.stale) {
      removed += 1;
      unlinkEdge(edge);
    }

    edge = next;
  }

  graphState.totalEdgeCount -= removed;
  graphState.staleEdgeCount = 0;
  graphState.staleSegmentHead = null;
  cleanupStats.sweepTriggeredCount += 1;
  cleanupStats.sweepRemovedTotal += removed;
  cleanupStats.sweepVisitedTotal += visited;

  return {
    removedCount: removed,
    visitedCount: visited,
  };
}

function unlinkAgedStaleEdges(node, graphState, cleanupStats, maxStaleAge) {
  let edge = node.firstIn;
  let removed = 0;
  let visited = 0;

  while (edge !== null) {
    const next = edge.nextIn;

    if (edge.stale) {
      visited += 1;
      if (edge.staleAge >= maxStaleAge) {
        removed += 1;
        cleanupStats.ageBoundRemovedTotal += 1;
        cleanupStats.staleAgeAtRemovalMax = Math.max(
          cleanupStats.staleAgeAtRemovalMax,
          edge.staleAge,
        );
        if (edge.staleAge >= 2) {
          cleanupStats.staleAgeRemovalHistogram.age2plus += 1;
        } else {
          cleanupStats.staleAgeRemovalHistogram.age1 += 1;
        }
        unlinkEdge(edge);
      }
    }

    edge = next;
  }

  graphState.totalEdgeCount -= removed;
  graphState.staleEdgeCount = Math.max(0, graphState.staleEdgeCount - removed);
  if (graphState.staleEdgeCount === 0) {
    graphState.staleSegmentHead = null;
  }

  return {
    removedCount: removed,
    visitedCount: visited,
  };
}

function unlinkBudgetedStaleEdges(node, graphState, cleanupStats, maxUnlinksPerPass) {
  let edge = node.firstIn;
  let removed = 0;
  let visited = 0;

  while (edge !== null) {
    const next = edge.nextIn;

    if (edge.stale) {
      visited += 1;
      if (removed < maxUnlinksPerPass) {
        removed += 1;
        cleanupStats.budgetedRemovedTotal += 1;
        unlinkEdge(edge);
      }
    }

    edge = next;
  }

  graphState.totalEdgeCount -= removed;
  graphState.staleEdgeCount = Math.max(0, graphState.staleEdgeCount - removed);
  if (graphState.staleEdgeCount === 0) {
    graphState.staleSegmentHead = null;
  }
  cleanupStats.budgetUsedTotal += removed;

  return {
    removedCount: removed,
    visitedCount: visited,
  };
}

function enqueueDeferredEdge(edge, graphState, cleanupStats) {
  edge.deferred = true;
  edge.stale = false;
  edge.staleAge = 0;
  graphState.deferredQueue.push(edge);
  graphState.deferredEdgeCount += 1;
  cleanupStats.deferredQueuePeak = Math.max(
    cleanupStats.deferredQueuePeak,
    graphState.deferredEdgeCount,
  );
}

function flushDeferredQueue(graphState, cleanupStats, limit = graphState.deferredQueue.length) {
  if (limit <= 0 || graphState.deferredQueue.length === 0) {
    return {
      removedCount: 0,
      visitedCount: 0,
    };
  }

  const removedEdges = graphState.deferredQueue.splice(0, limit);
  const visited = removedEdges.length;

  for (let i = 0; i < removedEdges.length; i += 1) {
    detachOutgoingOnly(removedEdges[i]);
    clearDetachedEdge(removedEdges[i]);
  }

  graphState.deferredEdgeCount -= removedEdges.length;
  cleanupStats.deferredFlushCount += 1;
  cleanupStats.deferredFlushRemovedTotal += removedEdges.length;
  cleanupStats.deferredFlushVisitedTotal += visited;

  return {
    removedCount: removedEdges.length,
    visitedCount: visited,
  };
}

function detachToDeferredQueue(node, graphState, passVersion, stats) {
  const cleanupStats = stats.cleanup;
  let edge = node.firstIn;
  let liveCount = 0;
  let removed = 0;
  let visited = 0;

  while (edge !== null) {
    const next = edge.nextIn;
    visited += 1;

    if (edge.mark === passVersion) {
      edge.stale = false;
      edge.staleAge = 0;
      liveCount += 1;
    } else {
      removed += 1;
      detachIncomingOnly(node, edge);
      enqueueDeferredEdge(edge, graphState, cleanupStats);
    }

    edge = next;
  }

  graphState.totalEdgeCount -= removed;
  graphState.staleSegmentHead = null;

  return {
    detachedCount: removed,
    liveCount,
    visited,
  };
}

function cleanupLazyPrecise(node, graphState, passVersion, stats) {
  const cleanupStats = stats.cleanup;
  cleanupStats.totalCleanupCalls += 1;

  const marking = markOrRetainStaleEdges(node, graphState, passVersion, stats);
  observeTransientStaleMetrics(
    cleanupStats,
    marking.liveCount,
    marking.staleCount,
  );
  cleanupStats.totalCleanupVisited += marking.visited;
  observeGraphMetrics(
    stats,
    marking.liveCount,
    marking.staleCount,
    graphState.totalEdgeCount,
  );

  return {
    cleanupVisited: marking.visited,
    liveCount: marking.liveCount,
    staleCount: marking.staleCount,
  };
}

function cleanupLazyPreciseBoundedAge(node, graphState, passVersion, stats) {
  const cleanupStats = stats.cleanup;
  cleanupStats.totalCleanupCalls += 1;

  const marking = markOrRetainStaleEdges(node, graphState, passVersion, stats);
  observeTransientStaleMetrics(
    cleanupStats,
    marking.liveCount,
    marking.staleCount,
  );

  let cleanupVisited = marking.visited;
  let staleCount = marking.staleCount;

  cleanupStats.totalCleanupVisited += marking.visited;

  const maxStaleAge = cleanupStats.ageBoundConfig?.maxStaleAge ?? 1;
  const agedUnlink = unlinkAgedStaleEdges(
    node,
    graphState,
    cleanupStats,
    maxStaleAge,
  );

  if (agedUnlink.removedCount !== 0) {
    cleanupVisited += agedUnlink.visitedCount;
    cleanupStats.totalCleanupVisited += agedUnlink.visitedCount;
    cleanupStats.totalCleanupRemoved += agedUnlink.removedCount;
    staleCount = Math.max(0, staleCount - agedUnlink.removedCount);
  }

  observeGraphMetrics(
    stats,
    marking.liveCount,
    staleCount,
    graphState.totalEdgeCount,
  );

  return {
    cleanupVisited,
    liveCount: marking.liveCount,
    staleCount,
  };
}

function cleanupLazyPreciseBudgeted(node, graphState, passVersion, stats) {
  const cleanupStats = stats.cleanup;
  cleanupStats.totalCleanupCalls += 1;

  const marking = markOrRetainStaleEdges(node, graphState, passVersion, stats);
  observeTransientStaleMetrics(
    cleanupStats,
    marking.liveCount,
    marking.staleCount,
  );

  let cleanupVisited = marking.visited;
  let staleCount = marking.staleCount;

  cleanupStats.totalCleanupVisited += marking.visited;

  const maxUnlinksPerPass = cleanupStats.budgetConfig?.maxUnlinksPerPass ?? 0;
  if (maxUnlinksPerPass > 0 && marking.staleCount > 0) {
    const budgetedUnlink = unlinkBudgetedStaleEdges(
      node,
      graphState,
      cleanupStats,
      maxUnlinksPerPass,
    );

    cleanupVisited += budgetedUnlink.visitedCount;
    cleanupStats.totalCleanupVisited += budgetedUnlink.visitedCount;
    cleanupStats.totalCleanupRemoved += budgetedUnlink.removedCount;
    staleCount = Math.max(0, staleCount - budgetedUnlink.removedCount);

    if (marking.staleCount > budgetedUnlink.removedCount) {
      cleanupStats.budgetLimitedPasses += 1;
    }
  }

  observeGraphMetrics(
    stats,
    marking.liveCount,
    staleCount,
    graphState.totalEdgeCount,
  );

  return {
    cleanupVisited,
    liveCount: marking.liveCount,
    staleCount,
  };
}

function cleanupLazyPreciseSuffixAssist(node, graphState, passVersion, stats) {
  const cleanupStats = stats.cleanup;
  cleanupStats.totalCleanupCalls += 1;

  const assist = tryCleanupSuffixAssist(node, graphState, passVersion, stats);
  if (assist !== null) {
    return assist;
  }

  const marking = markOrRetainStaleEdges(node, graphState, passVersion, stats);
  observeTransientStaleMetrics(
    cleanupStats,
    marking.liveCount,
    marking.staleCount,
  );
  cleanupStats.totalCleanupVisited += marking.visited;
  observeGraphMetrics(
    stats,
    marking.liveCount,
    marking.staleCount,
    graphState.totalEdgeCount,
  );

  return {
    cleanupVisited: marking.visited,
    liveCount: marking.liveCount,
    staleCount: marking.staleCount,
  };
}

function cleanupLazyPreciseVersionedSkip(
  node,
  graphState,
  passVersion,
  passState,
  stats,
) {
  const cleanupStats = stats.cleanup;
  cleanupStats.totalCleanupCalls += 1;
  const canSkipByTouch = passState.uniqueTouched === graphState.totalEdgeCount;

  if (graphState.staleEdgeCount === 0 && canSkipByTouch) {
    cleanupStats.versionedSkipCount += 1;
    cleanupStats.versionedSkipSavedVisited += graphState.totalEdgeCount;
    graphState.previousVersionedSkip = true;
    observeGraphMetrics(
      stats,
      graphState.totalEdgeCount,
      0,
      graphState.totalEdgeCount,
    );

    return {
      cleanupVisited: 0,
      liveCount: graphState.totalEdgeCount,
      staleCount: 0,
    };
  }

  if (graphState.staleEdgeCount !== 0) {
    cleanupStats.versionedSkipBlockedByStaleDebt += 1;
  }
  if (!canSkipByTouch) {
    cleanupStats.versionedSkipBlockedByUntouchedEdges += 1;
  }

  const marking = markOrRetainStaleEdges(node, graphState, passVersion, stats);
  observeTransientStaleMetrics(
    cleanupStats,
    marking.liveCount,
    marking.staleCount,
  );
  cleanupStats.totalCleanupVisited += marking.visited;
  if (graphState.previousVersionedSkip && marking.visited !== 0) {
    cleanupStats.versionedPostSkipCleanupCount += 1;
    cleanupStats.versionedPostSkipCleanupVisited += marking.visited;
  }
  graphState.previousVersionedSkip = false;
  observeGraphMetrics(
    stats,
    marking.liveCount,
    marking.staleCount,
    graphState.totalEdgeCount,
  );

  return {
    cleanupVisited: marking.visited,
    liveCount: marking.liveCount,
    staleCount: marking.staleCount,
  };
}

function shouldSweepBoundedRetention(marking, cleanupStats) {
  const config = cleanupStats.boundedConfig;
  if (!config) return false;

  const staleToLiveRatio =
    marking.liveCount === 0
      ? marking.staleCount === 0
        ? 0
        : marking.staleCount
      : marking.staleCount / marking.liveCount;

  return (
    marking.staleCount >= config.maxStaleEdges ||
    staleToLiveRatio >= config.maxStaleToLiveRatio
  );
}

function cleanupBoundedPrecise(node, graphState, passVersion, stats) {
  const cleanupStats = stats.cleanup;
  cleanupStats.totalCleanupCalls += 1;

  const marking = markOrRetainStaleEdges(node, graphState, passVersion, stats);
  observeTransientStaleMetrics(
    cleanupStats,
    marking.liveCount,
    marking.staleCount,
  );
  let cleanupVisited = marking.visited;
  let staleCount = marking.staleCount;

  cleanupStats.totalCleanupVisited += marking.visited;

  if (shouldSweepBoundedRetention(marking, cleanupStats)) {
    const sweep = sweepStaleEdges(node, graphState, cleanupStats);
    cleanupStats.totalCleanupVisited += sweep.visitedCount;
    cleanupStats.totalCleanupRemoved += sweep.removedCount;
    cleanupVisited += sweep.visitedCount;
    staleCount = 0;
  }

  observeGraphMetrics(
    stats,
    marking.liveCount,
    staleCount,
    graphState.totalEdgeCount,
  );

  return {
    cleanupVisited,
    liveCount: marking.liveCount,
    staleCount,
  };
}

function cleanupDeferredUnlink(node, graphState, passVersion, stats) {
  const cleanupStats = stats.cleanup;
  cleanupStats.totalCleanupCalls += 1;

  const detached = detachToDeferredQueue(node, graphState, passVersion, stats);
  cleanupStats.totalCleanupVisited += detached.visited;

  observeGraphMetrics(
    stats,
    detached.liveCount,
    0,
    graphState.totalEdgeCount + graphState.deferredEdgeCount,
  );

  return {
    cleanupVisited: detached.visited,
    liveCount: detached.liveCount,
    staleCount: 0,
  };
}

function cleanupBatchedDetach(node, graphState, passVersion, stats) {
  const cleanupStats = stats.cleanup;
  cleanupStats.totalCleanupCalls += 1;

  const detached = detachToDeferredQueue(node, graphState, passVersion, stats);
  let cleanupVisited = detached.visited;

  cleanupStats.totalCleanupVisited += detached.visited;

  const batchLimit = cleanupStats.batchConfig?.maxDeferredEdges ?? 0;
  if (graphState.deferredEdgeCount >= batchLimit && batchLimit > 0) {
    const flushed = flushDeferredQueue(graphState, cleanupStats, batchLimit);
    cleanupVisited += flushed.visitedCount;
    cleanupStats.totalCleanupRemoved += flushed.removedCount;
    cleanupStats.totalCleanupVisited += flushed.visitedCount;
  }

  observeGraphMetrics(
    stats,
    detached.liveCount,
    0,
    graphState.totalEdgeCount + graphState.deferredEdgeCount,
  );

  return {
    cleanupVisited,
    liveCount: detached.liveCount,
    staleCount: 0,
  };
}

function runCleanup(node, strategy, graphState, passVersion, passState, stats) {
  switch (strategy.cleanup.id) {
    case "eager_suffix_unlink":
      return cleanupEagerSuffix(node, graphState, stats);
    case "lazy_stale_mark":
      return cleanupLazyPrecise(node, graphState, passVersion, stats);
    case "lazy_stale_mark_bounded_age":
      return cleanupLazyPreciseBoundedAge(
        node,
        graphState,
        passVersion,
        stats,
      );
    case "lazy_stale_mark_budgeted":
      return cleanupLazyPreciseBudgeted(
        node,
        graphState,
        passVersion,
        stats,
      );
    case "lazy_stale_mark_suffix_assist":
      return cleanupLazyPreciseSuffixAssist(
        node,
        graphState,
        passVersion,
        stats,
      );
    case "lazy_stale_mark_versioned_skip":
      return cleanupLazyPreciseVersionedSkip(
        node,
        graphState,
        passVersion,
        passState,
        stats,
      );
    case "bounded_stale_retention":
      return cleanupBoundedPrecise(node, graphState, passVersion, stats);
    case "deferred_unlink":
      return cleanupDeferredUnlink(node, graphState, passVersion, stats);
    case "batched_detach":
      return cleanupBatchedDetach(node, graphState, passVersion, stats);
    default:
      throw new Error(`Unknown cleanup policy: ${strategy.cleanup.id}`);
  }
}

function forceDrain(node, graphState, stats) {
  const cleanupStats = stats.cleanup;
  cleanupStats.forcedDrainCalls += 1;
  let forcedVisited = 0;
  let forcedRemoved = 0;

  if (graphState.deferredEdgeCount !== 0) {
    const flushed = flushDeferredQueue(graphState, cleanupStats);
    forcedVisited += flushed.visitedCount;
    forcedRemoved += flushed.removedCount;
  }

  if (graphState.staleEdgeCount === 0) {
    graphState.staleSegmentHead = null;
    cleanupStats.forcedDrainRemovedTotal += forcedRemoved;
    cleanupStats.forcedDrainVisitedTotal += forcedVisited;
    return {
      removedCount: forcedRemoved,
      visitedCount: forcedVisited,
    };
  }

  let edge = node.firstIn;
  let removed = 0;
  let visited = 0;

  while (edge !== null) {
    const next = edge.nextIn;
    visited += 1;

    if (edge.stale) {
      removed += 1;
      unlinkEdge(edge);
    }

    edge = next;
  }

  graphState.totalEdgeCount -= removed;
  graphState.staleEdgeCount = 0;
  graphState.staleSegmentHead = null;
  cleanupStats.forcedDrainRemovedTotal += forcedRemoved + removed;
  cleanupStats.forcedDrainVisitedTotal += forcedVisited + visited;

  return {
    removedCount: forcedRemoved + removed,
    visitedCount: forcedVisited + visited,
  };
}

function verifyDrainedGraph(node, expectedLiveSet, expectedLiveCount) {
  const seen = new Uint8Array(expectedLiveSet.length);
  let residualStaleEdges = 0;
  let unexpectedLiveEdges = 0;
  let verifiedLiveEdges = 0;

  for (let edge = node.firstIn; edge !== null; edge = edge.nextIn) {
    if (edge.stale) {
      residualStaleEdges += 1;
      continue;
    }

    verifiedLiveEdges += 1;
    const sourceIndex = edge.from.debugIndex;
    if (expectedLiveSet[sourceIndex] === 0) {
      unexpectedLiveEdges += 1;
    } else {
      seen[sourceIndex] = 1;
    }
  }

  let missingLiveEdges = 0;

  for (let i = 0; i < expectedLiveSet.length; i += 1) {
    if (expectedLiveSet[i] === 1 && seen[i] === 0) {
      missingLiveEdges += 1;
    }
  }

  return {
    equivalentAfterDrain:
      residualStaleEdges === 0 &&
      unexpectedLiveEdges === 0 &&
      missingLiveEdges === 0 &&
      verifiedLiveEdges === expectedLiveCount,
    missingLiveEdges,
    residualStaleEdges,
    unexpectedLiveEdges,
    verifiedLiveEdges,
  };
}

function finalizeHorizonAverages(stats, passCount) {
  if (passCount === 0) {
    return;
  }

  stats.horizon.avgCleanupVisitedPerPass = round(
    stats.horizon.avgCleanupVisitedPerPass / passCount,
    2,
  );
  stats.horizon.avgLiveEdgesPerPass = round(
    stats.horizon.avgLiveEdgesPerPass / passCount,
    2,
  );
  stats.horizon.avgStaleEdgesPerPass = round(
    stats.horizon.avgStaleEdgesPerPass / passCount,
    2,
  );
}

function executeScenario(config, plan, strategy) {
  const { consumer, sources } = createLifecycleGraph(config.fanIn);
  const graphState = createGraphState(config.fanIn);
  const stats = createLifecycleStats(config, strategy);
  let passVersion = 0;

  const startMs = performance.now();

  for (let passIndex = 0; passIndex < plan.passes.length; passIndex += 1) {
    const readIndices = plan.passes[passIndex];
    const passState = {
      reads: 0,
      scanWork: 0,
      uniqueTouched: 0,
    };

    consumer.depsTail = null;
    passVersion += 1;
    stats.tracking.recomputes += 1;

    for (let i = 0; i < readIndices.length; i += 1) {
      trackRead(
        sources[readIndices[i]],
        consumer,
        strategy,
        passState,
        passVersion,
        graphState,
        stats.tracking,
      );
    }

    const cleanupResult = runCleanup(
      consumer,
      strategy,
      graphState,
      passVersion,
      passState,
      stats,
    );

    stats.horizon.totalReads += passState.reads;
    stats.horizon.totalScanWork += passState.scanWork;
    stats.horizon.totalCleanupWork += cleanupResult.cleanupVisited;
    stats.horizon.avgCleanupVisitedPerPass += cleanupResult.cleanupVisited;

    if (cleanupResult.liveCount !== readIndices.length) {
      stats.horizon.passConsistencyFailures += 1;
    }
  }

  const drain = forceDrain(consumer, graphState, stats);
  const verification = verifyDrainedGraph(
    consumer,
    plan.expectedLiveSet,
    plan.expectedLiveCount,
  );
  const elapsedMs = performance.now() - startMs;

  finalizeHorizonAverages(stats, plan.passes.length);

  stats.cleanup = summarizeCleanupStats(stats.cleanup, plan.passes.length);
  stats.tracking = summarizeTrackingStats(stats.tracking);
  stats.drains = {
    ...verification,
    forcedDrainCost: drain.visitedCount,
  };
  stats.horizon.totalWorkWithDrain =
    stats.horizon.totalScanWork +
    stats.horizon.totalCleanupWork +
    drain.visitedCount;
  stats.timing = {
    elapsedMs: round(elapsedMs, 4),
    nsPerPass: round((elapsedMs * 1e6) / plan.passes.length, 2),
    nsPerRead: round((elapsedMs * 1e6) / plan.totalReads, 2),
  };

  return {
    report: stats,
    sink: verification.verifiedLiveEdges & 1,
  };
}

function createScenarioRunner(config, strategy) {
  const plan = buildWorkloadPlan(config);

  return {
    benchmarkIterations: config.benchmarkIterations,
    passCount: config.passCount,
    strategy,
    totalReadsPerScenario: plan.totalReads,
    warmupIterations: config.warmupIterations,
    run() {
      return executeScenario(config, plan, strategy);
    },
  };
}

function printProfile(report) {
  console.log(JSON.stringify(report, null, 2));
}

function runBenchmarkScenario(kind, fanIn, trackingId, cleanupId, passCount, phaseLength) {
  const config = createWorkloadConfig(kind, fanIn, phaseLength, passCount);
  const strategy = resolveStrategy(trackingId, cleanupId);
  const runner = createScenarioRunner(config, strategy);

  benchScenario(
    `${kind}_${fanIn}:${strategy.id}`,
    () => runner.run().sink,
    runner.benchmarkIterations,
    runner.warmupIterations,
    runner.totalReadsPerScenario,
    runner.passCount,
  );
}

function runCompareScenario(kind, fanIn, passCount, phaseLength) {
  const config = createWorkloadConfig(kind, fanIn, phaseLength, passCount);
  const strategies = getValidStrategies();

  for (const strategy of strategies) {
    const runner = createScenarioRunner(config, strategy);
    benchScenario(
      `${kind}_${fanIn}:${strategy.id}`,
      () => runner.run().sink,
      runner.benchmarkIterations,
      runner.warmupIterations,
      runner.totalReadsPerScenario,
      runner.passCount,
    );
  }
}

function runProfileScenario(kind, fanIn, trackingId, cleanupId, passCount, phaseLength) {
  const config = createWorkloadConfig(kind, fanIn, phaseLength, passCount);
  const strategy = resolveStrategy(trackingId, cleanupId);
  const runner = createScenarioRunner(config, strategy);
  printProfile(runner.run().report);
}

function runDefaultMatrixSuite(fanIn) {
  for (const workload of DEFAULT_COMPARE_WORKLOADS) {
    runCompareScenario(workload, fanIn, undefined, undefined);
  }
}

function parsePositiveInteger(input, label) {
  const value = Number(input);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ${label}: ${input}`);
  }
  return value;
}

function parseOptionalPhaseLength(input, kind) {
  if (input === undefined) return getDefaultPhaseLength(kind);

  const phaseLength = Number(input);
  if (!Number.isInteger(phaseLength) || phaseLength < 0) {
    throw new Error(`Invalid phaseLength: ${input}`);
  }
  return phaseLength;
}

function parseOptionalPassCount(input, kind, fanIn, phaseLength) {
  if (input === undefined) {
    return getDefaultPassCount(kind, fanIn, phaseLength);
  }
  return parsePositiveInteger(input, "passCount");
}

function main() {
  const mode = process.argv[2] ?? "compare";

  if (mode === "compare") {
    const kind = process.argv[3] ?? "rotate";
    const fanIn = parsePositiveInteger(process.argv[4] ?? "32", "fanIn");
    const phaseLength = parseOptionalPhaseLength(process.argv[5], kind);
    const passCount = parseOptionalPassCount(
      process.argv[6],
      kind,
      fanIn,
      phaseLength,
    );

    runCompareScenario(kind, fanIn, passCount, phaseLength);
    return;
  }

  if (mode === "scenario") {
    const kind = process.argv[3];
    const trackingId = process.argv[4];
    const cleanupId = process.argv[5];
    const fanIn = parsePositiveInteger(process.argv[6] ?? "32", "fanIn");
    const phaseLength = parseOptionalPhaseLength(process.argv[7], kind);
    const passCount = parseOptionalPassCount(
      process.argv[8],
      kind,
      fanIn,
      phaseLength,
    );

    if (!kind || !trackingId || !cleanupId) {
      throw new Error("scenario requires workload, tracking policy, and cleanup policy");
    }

    runBenchmarkScenario(
      kind,
      fanIn,
      trackingId,
      cleanupId,
      passCount,
      phaseLength,
    );
    return;
  }

  if (mode === "profile") {
    const kind = process.argv[3];
    const trackingId = process.argv[4];
    const cleanupId = process.argv[5];
    const fanIn = parsePositiveInteger(process.argv[6] ?? "32", "fanIn");
    const phaseLength = parseOptionalPhaseLength(process.argv[7], kind);
    const passCount = parseOptionalPassCount(
      process.argv[8],
      kind,
      fanIn,
      phaseLength,
    );

    if (!kind || !trackingId || !cleanupId) {
      throw new Error("profile requires workload, tracking policy, and cleanup policy");
    }

    runProfileScenario(
      kind,
      fanIn,
      trackingId,
      cleanupId,
      passCount,
      phaseLength,
    );
    return;
  }

  if (mode === "matrix") {
    const fanIn = parsePositiveInteger(process.argv[3] ?? "32", "fanIn");
    runDefaultMatrixSuite(fanIn);
    return;
  }

  if (mode === "catalog") {
    console.log(
      JSON.stringify(
        {
          cleanupPolicies: CLEANUP_POLICIES,
          strategies: getValidStrategies().map((strategy) => strategy.id),
          trackingPolicies: TRACKING_POLICIES,
          workloads: DEFAULT_COMPARE_WORKLOADS,
        },
        null,
        2,
      ),
    );
    return;
  }

  throw new Error(`Unknown mode: ${mode}`);
}

main();
