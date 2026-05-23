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

const POLICIES = [
  { id: "reorder_always", cleanup: "suffix" },
  { id: "find_only", cleanup: "mark_sweep" },
  { id: "reorder_scan_gt_1", cleanup: "mark_sweep" },
  { id: "adaptive_rotate_guard", cleanup: "adaptive" },
];

const POLICY_MAP = new Map(POLICIES.map((policy) => [policy.id, policy]));
const POLICY_ALIASES = new Map([
  ["adaptive_hysteresis", "adaptive_rotate_guard"],
]);
const WORKLOAD_KINDS = new Set([
  "static",
  "rotate",
  "mixed",
  "alt_ab",
  "oscillate_rotate_branch",
  "oscillate_rotate_swap",
  "swap_small",
  "stable_then_drop",
  "branch_half",
  "prefix_suffix_chaotic",
]);

const DEFAULT_ADAPTIVE_CONFIG = {
  role: "rotate_guard",
  enterConsecutivePasses: 2,
  enterFallbackRateMin: 0.5,
  enterAvgScanLenMax: 2.5,
  enterRetentionRateMin: 0.95,
  enterSetChurnRateMax: 0.05,
  enterRemoveRateMax: 0.05,
  minStableResidencyPasses: 0,
  exitConsecutivePasses: 4,
  exitScanWorkPerReadMin: 1,
  exitSetChurnRateMin: 0.1,
  exitRetentionRateMax: 0.85,
  emergencyExitSetChurnRateMin: 1,
  minChurnResidencyPasses: 8,
  switchWindowPasses: 16,
};

function normalizePolicyId(policyId) {
  return POLICY_ALIASES.get(policyId) ?? policyId;
}

function createProducer(value) {
  return new ReactiveNode(value, null, PRODUCER_INITIAL_STATE);
}

function createConsumer() {
  return new ReactiveNode(UNINITIALIZED, null, CONSUMER_CHANGED);
}

function warm(fn, iterations) {
  let sink = 0;

  for (let i = 0; i < iterations; i += 1) {
    sink ^= fn(i) & 1;
  }

  return sink;
}

function benchLifecycle(label, fn, iterations, warmup, readsPerPass) {
  warm(fn, warmup);

  if (globalThis.gc) globalThis.gc();

  let sink = 0;
  const start = performance.now();

  for (let i = 0; i < iterations; i += 1) {
    sink ^= fn(i) & 1;
  }

  const elapsedMs = performance.now() - start;
  const totalReads = iterations * readsPerPass;
  const nsPerRead = (elapsedMs * 1e6) / totalReads;
  const nsPerRecompute = (elapsedMs * 1e6) / iterations;
  console.log(
    `${label}: ${nsPerRead.toFixed(1)} ns/read | ${nsPerRecompute.toFixed(1)} ns/recompute | sink=${sink}`,
  );
}

function round(value, digits = 2) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function roundOrNull(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }

  return round(value, digits);
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

function reverseIndices(fanIn) {
  const indices = new Array(fanIn);

  for (let i = 0; i < fanIn; i += 1) {
    indices[i] = fanIn - 1 - i;
  }

  return indices;
}

function createXorshift32(seed) {
  let state = seed >>> 0;

  return function nextInt() {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

function shuffleSlice(values, startIndex, nextInt) {
  for (let i = values.length - 1; i > startIndex; i -= 1) {
    const range = i - startIndex + 1;
    const j = startIndex + (nextInt() % range);
    const temp = values[i];
    values[i] = values[j];
    values[j] = temp;
  }
}

function applyAdjacentSwap(values, position) {
  const temp = values[position];
  values[position] = values[position + 1];
  values[position + 1] = temp;
}

function getDefaultPhaseLength(kind) {
  switch (kind) {
    case "mixed":
    case "branch_half":
      return 8;
    case "oscillate_rotate_branch":
    case "oscillate_rotate_swap":
    case "stable_then_drop":
      return 20;
    default:
      return 0;
  }
}

function getDropCount(fanIn) {
  return Math.max(1, Math.floor(fanIn / 2));
}

function getBranchCount(fanIn) {
  return Math.max(1, Math.floor(fanIn / 2));
}

function getPrefixCount(fanIn) {
  return Math.max(1, Math.floor(fanIn / 4));
}

function getDefaultIterations(fanIn, kind) {
  switch (kind) {
    case "static":
      return fanIn <= 16 ? 80000 : fanIn <= 64 ? 40000 : 15000;
    case "rotate":
      return fanIn <= 16 ? 60000 : fanIn <= 64 ? 25000 : 10000;
    case "mixed":
    case "alt_ab":
    case "swap_small":
    case "branch_half":
    case "prefix_suffix_chaotic":
    case "oscillate_rotate_branch":
    case "oscillate_rotate_swap":
    case "stable_then_drop":
      return fanIn <= 16 ? 50000 : fanIn <= 64 ? 20000 : 8000;
    default:
      return 20000;
  }
}

function createWorkloadConfig(kind, fanIn, phaseLength = getDefaultPhaseLength(kind)) {
  if (!WORKLOAD_KINDS.has(kind)) {
    throw new Error(`Unknown workload kind: ${kind}`);
  }

  const iterations = getDefaultIterations(fanIn, kind);

  return {
    kind,
    fanIn,
    phaseLength,
    iterations,
    warmup: Math.max(5000, Math.floor(iterations / 2)),
  };
}

function createReadPlanner(config) {
  const baseOrder = createBaseOrder(config.fanIn);
  const rotations = createRotations(config.fanIn);
  const reverseOrder = reverseIndices(config.fanIn);
  const swapOrder = baseOrder.slice();
  const chaoticOrder = baseOrder.slice();
  const nextInt = createXorshift32(
    (0x85ebca6b ^ (config.fanIn << 7) ^ config.kind.length) >>> 0,
  );
  const branchCount = getBranchCount(config.fanIn);
  const firstHalf = baseOrder.slice(0, branchCount);
  const secondHalf = baseOrder.slice(branchCount);
  const prefixCount = getPrefixCount(config.fanIn);
  const dropCount = getDropCount(config.fanIn);
  const retainedOrder = baseOrder.slice(0, config.fanIn - dropCount);
  let iteration = 0;
  let offset = 0;
  let branchToggle = false;

  return function getReadIndices() {
    switch (config.kind) {
      case "static":
        return baseOrder;
      case "rotate":
        offset = (offset + 1) % config.fanIn;
        return rotations[offset];
      case "mixed":
        if (iteration !== 0 && iteration % config.phaseLength === 0) {
          offset = (offset + 1) % config.fanIn;
        }
        iteration += 1;
        return rotations[offset];
      case "alt_ab": {
        const current = iteration % 2 === 0 ? baseOrder : reverseOrder;
        iteration += 1;
        return current;
      }
      case "oscillate_rotate_branch": {
        const phase = Math.floor(iteration / config.phaseLength) % 2;
        const current = phase === 0 ? rotations[(iteration + 1) % config.fanIn] : (branchToggle ? secondHalf : firstHalf);
        if (phase === 1) {
          branchToggle = !branchToggle;
        }
        iteration += 1;
        return current;
      }
      case "oscillate_rotate_swap": {
        const phase = Math.floor(iteration / config.phaseLength) % 2;
        if (phase === 0) {
          offset = (offset + 1) % config.fanIn;
          iteration += 1;
          return rotations[offset];
        }
        if (config.fanIn > 1) {
          const swapsPerPass = Math.min(3, config.fanIn - 1);
          for (let i = 0; i < swapsPerPass; i += 1) {
            const position = nextInt() % (config.fanIn - 1);
            applyAdjacentSwap(swapOrder, position);
          }
        }
        iteration += 1;
        return swapOrder;
      }
      case "swap_small":
        if (config.fanIn > 1) {
          const swapsPerPass = Math.min(3, config.fanIn - 1);
          for (let i = 0; i < swapsPerPass; i += 1) {
            const position = nextInt() % (config.fanIn - 1);
            applyAdjacentSwap(swapOrder, position);
          }
        }
        return swapOrder;
      case "stable_then_drop": {
        const cycleLength = config.phaseLength + 1;
        const phaseIndex = iteration % cycleLength;
        iteration += 1;
        return phaseIndex === config.phaseLength ? retainedOrder : baseOrder;
      }
      case "branch_half":
        if (iteration !== 0 && iteration % config.phaseLength === 0) {
          branchToggle = !branchToggle;
        }
        iteration += 1;
        return branchToggle ? secondHalf : firstHalf;
      case "prefix_suffix_chaotic":
        for (let i = 0; i < prefixCount; i += 1) {
          chaoticOrder[i] = baseOrder[i];
        }
        for (let i = prefixCount; i < config.fanIn; i += 1) {
          chaoticOrder[i] = baseOrder[i];
        }
        shuffleSlice(chaoticOrder, prefixCount, nextInt);
        return chaoticOrder;
      default:
        throw new Error(`Unknown workload kind: ${config.kind}`);
    }
  };
}

function createTrackingStats() {
  return {
    recomputes: 0,
    recomputesWithFallback: 0,
    reads: 0,
    headHits: 0,
    sameEdgeHits: 0,
    nextExpectedHits: 0,
    fallbackScans: 0,
    fallbackFoundExisting: 0,
    fallbackCreatedNew: 0,
    fallbackReorders: 0,
    fallbackSkippedReorders: 0,
    wrappedResolvedCount: 0,
    fallbackScanStepsTotal: 0,
    fallbackScanStepsMax: 0,
  };
}

function createCleanupStats(mode) {
  return {
    mode,
    cleanupCalls: 0,
    cleanupNoops: 0,
    cleanupRemovedEdgesTotal: 0,
    cleanupRemovedEdgesMax: 0,
    cleanupVisitedEdgesTotal: 0,
    cleanupVisitedEdgesMax: 0,
    cleanupKeptEdgesTotal: 0,
  };
}

function summarizeTrackingStats(stats) {
  const fastPathHits =
    stats.headHits + stats.sameEdgeHits + stats.nextExpectedHits;

  return {
    ...stats,
    fastPathHits,
    readsPerRecompute:
      stats.recomputes === 0 ? 0 : round(stats.reads / stats.recomputes, 2),
    fastPathRate: stats.reads === 0 ? 0 : round(fastPathHits / stats.reads, 4),
    fallbackRate:
      stats.reads === 0 ? 0 : round(stats.fallbackScans / stats.reads, 4),
    fallbackPassRate:
      stats.recomputes === 0
        ? 0
        : round(stats.recomputesWithFallback / stats.recomputes, 4),
    fallbackAvgScanLen:
      stats.fallbackScans === 0
        ? 0
        : round(stats.fallbackScanStepsTotal / stats.fallbackScans, 2),
    wrappedResolvedRate:
      stats.reads === 0 ? 0 : round(stats.wrappedResolvedCount / stats.reads, 4),
    fallbackReorderRate:
      stats.fallbackFoundExisting === 0
        ? 0
        : round(stats.fallbackReorders / stats.fallbackFoundExisting, 4),
  };
}

function summarizeCleanupStats(stats) {
  return {
    ...stats,
    cleanupRemovedEdgesAvg:
      stats.cleanupCalls === 0
        ? 0
        : round(stats.cleanupRemovedEdgesTotal / stats.cleanupCalls, 2),
    cleanupVisitedEdgesAvg:
      stats.cleanupCalls === 0
        ? 0
        : round(stats.cleanupVisitedEdgesTotal / stats.cleanupCalls, 2),
    cleanupKeptEdgesAvg:
      stats.cleanupCalls === 0
        ? 0
        : round(stats.cleanupKeptEdgesTotal / stats.cleanupCalls, 2),
  };
}

function shouldReorder(policyId, scanSteps) {
  switch (policyId) {
    case "reorder_always":
      return true;
    case "find_only":
      return false;
    case "reorder_scan_gt_1":
      return scanSteps > 1;
    default:
      throw new Error(`Unknown policy: ${policyId}`);
  }
}

function createAdaptiveState(config = DEFAULT_ADAPTIVE_CONFIG) {
  return {
    blockedExitSignals: 0,
    mode: "stable",
    stablePasses: 0,
    churnPasses: 0,
    config: {
      ...config,
    },
    enterSignalStreak: 0,
    emergencyExitCount: 0,
    exitSignalStreak: 0,
    needsWrappedCanonicalize: false,
    passesInCurrentMode: 0,
    perModeTotals: {
      stable: {
        cleanupRemoved: 0,
        cleanupVisited: 0,
        passes: 0,
        reads: 0,
        scanWork: 0,
      },
      churn: {
        cleanupRemoved: 0,
        cleanupVisited: 0,
        passes: 0,
        reads: 0,
        scanWork: 0,
      },
    },
    pendingPostWindows: [],
    recentPasses: [],
    modeSwitches: [],
  };
}

function summarizePassWindow(entries) {
  if (entries.length === 0) {
    return {
      avgCleanupRemovedPerPass: 0,
      avgCleanupVisitedPerPass: 0,
      avgFallbackRate: 0,
      avgScanWorkPerRead: 0,
      avgSetChurnRate: 0,
      avgWrappedResolvedRate: 0,
      passCount: 0,
      totalCleanupRemoved: 0,
      totalCleanupVisited: 0,
      totalReads: 0,
      totalScanWork: 0,
    };
  }

  let totalCleanupRemoved = 0;
  let totalCleanupVisited = 0;
  let totalFallbackRate = 0;
  let totalReads = 0;
  let totalScanWork = 0;
  let totalSetChurnRate = 0;
  let totalWrappedResolvedRate = 0;

  for (const entry of entries) {
    totalCleanupRemoved += entry.cleanupRemoved;
    totalCleanupVisited += entry.cleanupVisited;
    totalFallbackRate += entry.fallbackRate;
    totalReads += entry.reads;
    totalScanWork += entry.scanWork;
    totalSetChurnRate += entry.setChurnRate;
    totalWrappedResolvedRate += entry.wrappedResolvedRate;
  }

  return {
    avgCleanupRemovedPerPass: round(totalCleanupRemoved / entries.length, 4),
    avgCleanupVisitedPerPass: round(totalCleanupVisited / entries.length, 4),
    avgCleanupVisitedPerRead: round(totalCleanupVisited / Math.max(totalReads, 1), 4),
    avgFallbackRate: round(totalFallbackRate / entries.length, 4),
    avgReadsPerPass: round(totalReads / entries.length, 4),
    avgScanWorkPerRead: round(totalScanWork / Math.max(totalReads, 1), 4),
    avgSetChurnRate: round(totalSetChurnRate / entries.length, 4),
    avgWorkPerPass: round(
      (totalScanWork + totalCleanupVisited) / entries.length,
      4,
    ),
    avgWorkPerRead: round(
      (totalScanWork + totalCleanupVisited) / Math.max(totalReads, 1),
      4,
    ),
    avgWrappedResolvedRate: round(
      totalWrappedResolvedRate / entries.length,
      4,
    ),
    passCount: entries.length,
    totalCleanupRemoved,
    totalCleanupVisited,
    totalReads,
    totalScanWork,
    totalWork: totalScanWork + totalCleanupVisited,
  };
}

function summarizeSwitchEconomics(modeSwitches) {
  const enterGains = [];
  const exitLosses = [];
  const canonicalizationDebts = [];
  const paybackPasses = [];
  const pairedSwitches = [];
  let enterSwitchCount = 0;
  let exitSwitchCount = 0;
  let pendingEnter = null;

  for (const event of modeSwitches) {
    const preWork = event.preWindow?.passCount
      ? event.preWindow.avgWorkPerPass
      : null;
    const postWork = event.postWindow?.passCount
      ? event.postWindow.avgWorkPerPass
      : null;

    event.economics = {
      deltaAfterSwitch: roundOrNull(
        preWork === null || postWork === null ? null : postWork - preWork,
        4,
      ),
      postWorkPerPass: roundOrNull(postWork, 4),
      preWorkPerPass: roundOrNull(preWork, 4),
    };

    if (event.from === "stable" && event.to === "churn") {
      enterSwitchCount += 1;
      const gainAfterEnter = roundOrNull(
        preWork === null || postWork === null ? null : preWork - postWork,
        4,
      );
      event.economics.gainAfterEnter = gainAfterEnter;

      if (gainAfterEnter !== null) {
        enterGains.push(gainAfterEnter);
      }

      pendingEnter = {
        gainAfterEnter,
        pass: event.pass,
      };
      continue;
    }

    if (event.from === "churn" && event.to === "stable") {
      exitSwitchCount += 1;
      const lossBeforeExit = roundOrNull(
        preWork === null || postWork === null ? null : postWork - preWork,
        4,
      );
      const canonicalizationDebt = roundOrNull(
        lossBeforeExit === null ? null : Math.max(0, lossBeforeExit),
        4,
      );

      event.economics.lossBeforeExit = lossBeforeExit;
      event.economics.canonicalizationDebt = canonicalizationDebt;

      if (lossBeforeExit !== null) {
        exitLosses.push(lossBeforeExit);
      }
      if (canonicalizationDebt !== null) {
        canonicalizationDebts.push(canonicalizationDebt);
      }

      if (pendingEnter !== null) {
        const estimatedPaybackPasses = roundOrNull(
          pendingEnter.gainAfterEnter !== null &&
            pendingEnter.gainAfterEnter > 0 &&
            canonicalizationDebt !== null
            ? canonicalizationDebt / pendingEnter.gainAfterEnter
            : null,
          2,
        );

        event.economics.estimatedPaybackPasses = estimatedPaybackPasses;
        pairedSwitches.push({
          canonicalizationDebt,
          enterPass: pendingEnter.pass,
          estimatedPaybackPasses,
          exitPass: event.pass,
          gainAfterEnter: pendingEnter.gainAfterEnter,
          lossBeforeExit,
        });

        if (estimatedPaybackPasses !== null) {
          paybackPasses.push(estimatedPaybackPasses);
        }
      }

      pendingEnter = null;
    }
  }

  return {
    avgCanonicalizationDebt:
      canonicalizationDebts.length === 0
        ? 0
        : round(
            canonicalizationDebts.reduce((sum, value) => sum + value, 0) /
              canonicalizationDebts.length,
            4,
          ),
    avgEstimatedPaybackPasses:
      paybackPasses.length === 0
        ? 0
        : round(
            paybackPasses.reduce((sum, value) => sum + value, 0) /
              paybackPasses.length,
            2,
          ),
    avgGainAfterEnter:
      enterGains.length === 0
        ? 0
        : round(
            enterGains.reduce((sum, value) => sum + value, 0) /
              enterGains.length,
            4,
          ),
    avgLossBeforeExit:
      exitLosses.length === 0
        ? 0
        : round(
            exitLosses.reduce((sum, value) => sum + value, 0) /
              exitLosses.length,
            4,
          ),
    enterSwitchCount,
    exitSwitchCount,
    maxEstimatedPaybackPasses:
      paybackPasses.length === 0 ? 0 : Math.max(...paybackPasses),
    pairedSwitchCount: pairedSwitches.length,
    pairedSwitches,
    switchCount: modeSwitches.length,
  };
}

function recordAdaptivePass(adaptiveState, passMetrics) {
  const { config } = adaptiveState;
  const bucket = adaptiveState.perModeTotals[passMetrics.mode];
  bucket.passes += 1;
  bucket.reads += passMetrics.reads;
  bucket.scanWork += passMetrics.scanWork;
  bucket.cleanupVisited += passMetrics.cleanupVisited;
  bucket.cleanupRemoved += passMetrics.cleanupRemoved;

  adaptiveState.recentPasses.push(passMetrics);
  if (adaptiveState.recentPasses.length > config.switchWindowPasses) {
    adaptiveState.recentPasses.shift();
  }

  for (const pending of adaptiveState.pendingPostWindows) {
    pending.entries.push(passMetrics);
  }

  adaptiveState.pendingPostWindows = adaptiveState.pendingPostWindows.filter(
    (pending) => {
      if (pending.entries.length >= config.switchWindowPasses) {
        pending.target.postWindow = summarizePassWindow(pending.entries);
        return false;
      }
      return true;
    },
  );
}

function resolveStrategy(policyId, adaptiveState) {
  if (policyId === "adaptive_rotate_guard") {
    if (adaptiveState.mode === "churn") {
      return {
        cleanup: "mark_sweep",
        mode: "churn",
        policy: "find_only",
        wrappedSearch: true,
      };
    }

    return {
      cleanup: "suffix",
      mode: "stable",
      policy: "reorder_always",
      wrappedSearch: adaptiveState.needsWrappedCanonicalize,
    };
  }

  return {
    cleanup: POLICY_MAP.get(policyId)?.cleanup ?? "suffix",
    mode: "fixed",
    policy: policyId,
    wrappedSearch: policyId !== "reorder_always",
  };
}

function shouldEnterChurn(metrics, config) {
  return (
    metrics.fallbackRate >= config.enterFallbackRateMin &&
    metrics.fallbackAvgScanLen <= config.enterAvgScanLenMax &&
    metrics.retentionRate >= config.enterRetentionRateMin &&
    metrics.setChurnRate <= config.enterSetChurnRateMax &&
    metrics.removeRate <= config.enterRemoveRateMax
  );
}

function shouldExitChurn(metrics, config) {
  return (
    metrics.scanWorkPerRead >= config.exitScanWorkPerReadMin ||
    metrics.setChurnRate >= config.exitSetChurnRateMin ||
    metrics.retentionRate <= config.exitRetentionRateMax
  );
}

function createSwitchEvent(adaptiveState, passVersion, from, to, metrics, reason) {
  return {
    from,
    metrics,
    pass: passVersion,
    preWindow: summarizePassWindow(adaptiveState.recentPasses),
    reason,
    residencyPasses: adaptiveState.passesInCurrentMode,
    to,
  };
}

function maybeUpdateAdaptiveMode(adaptiveState, metrics, passVersion) {
  const { config } = adaptiveState;
  adaptiveState.passesInCurrentMode += 1;

  if (adaptiveState.mode === "stable") {
    adaptiveState.stablePasses += 1;

    if (adaptiveState.needsWrappedCanonicalize) {
      adaptiveState.needsWrappedCanonicalize = false;
    }

    if (shouldEnterChurn(metrics, config)) {
      adaptiveState.enterSignalStreak += 1;
    } else {
      adaptiveState.enterSignalStreak = 0;
    }

    if (
      adaptiveState.passesInCurrentMode >= config.minStableResidencyPasses &&
      adaptiveState.enterSignalStreak >= config.enterConsecutivePasses
    ) {
      const switchEvent = createSwitchEvent(
        adaptiveState,
        passVersion,
        "stable",
        "churn",
        metrics,
        "enter_signal",
      );
      adaptiveState.mode = "churn";
      adaptiveState.enterSignalStreak = 0;
      adaptiveState.exitSignalStreak = 0;
      adaptiveState.passesInCurrentMode = 0;
      adaptiveState.modeSwitches.push(switchEvent);
      adaptiveState.pendingPostWindows.push({
        entries: [],
        target: switchEvent,
      });
    }

    return;
  }

  adaptiveState.churnPasses += 1;
  const emergencyExit =
    metrics.setChurnRate >= config.emergencyExitSetChurnRateMin;

  if (shouldExitChurn(metrics, config)) {
    adaptiveState.exitSignalStreak += 1;
  } else {
    adaptiveState.exitSignalStreak = 0;
  }

  if (
    !emergencyExit &&
    adaptiveState.exitSignalStreak >= config.exitConsecutivePasses &&
    adaptiveState.passesInCurrentMode < config.minChurnResidencyPasses
  ) {
    adaptiveState.blockedExitSignals += 1;
    return;
  }

  if (
    emergencyExit ||
    (adaptiveState.exitSignalStreak >= config.exitConsecutivePasses &&
      adaptiveState.passesInCurrentMode >= config.minChurnResidencyPasses)
  ) {
    const switchEvent = createSwitchEvent(
      adaptiveState,
      passVersion,
      "churn",
      "stable",
      metrics,
      emergencyExit ? "emergency_exit" : "exit_signal",
    );
    adaptiveState.mode = "stable";
    adaptiveState.exitSignalStreak = 0;
    adaptiveState.enterSignalStreak = 0;
    adaptiveState.passesInCurrentMode = 0;
    adaptiveState.needsWrappedCanonicalize = true;
    if (emergencyExit) {
      adaptiveState.emergencyExitCount += 1;
    }
    adaptiveState.modeSwitches.push(switchEvent);
    adaptiveState.pendingPostWindows.push({
      entries: [],
      target: switchEvent,
    });
  }
}

function findReusableEdge(
  consumer,
  source,
  nextExpected,
  passVersion,
  wrapped,
) {
  let scanSteps = 0;
  const scanStart = nextExpected ? nextExpected.nextIn : consumer.firstIn;

  for (let edge = scanStart; edge !== null; edge = edge.nextIn) {
    scanSteps += 1;
    if (edge.from === source && (!wrapped || edge.mark !== passVersion)) {
      return { edge, scanSteps, wrappedHit: false };
    }
  }

  if (wrapped && scanStart !== consumer.firstIn) {
    for (let edge = consumer.firstIn; edge !== scanStart; edge = edge.nextIn) {
      scanSteps += 1;
      if (edge.from === source && edge.mark !== passVersion) {
        return { edge, scanSteps, wrappedHit: true };
      }
    }
  }

  return { edge: null, scanSteps, wrappedHit: false };
}

function finalizePass(passState, stats) {
  if (passState.hadFallback) {
    stats.recomputesWithFallback += 1;
  }
}

function markEdge(edge, passVersion) {
  edge.mark = passVersion;
}

function trackReadLifecycle(source, consumer, policyId, passState, passVersion, stats) {
  stats.reads += 1;
  passState.reads += 1;
  const strategy = passState.strategy;

  const prevEdge = consumer.depsTail;
  if (prevEdge !== null) {
    if (prevEdge.from === source) {
      stats.sameEdgeHits += 1;
      markEdge(prevEdge, passVersion);
      return;
    }

    const nextExpected = prevEdge.nextIn;
    if (nextExpected !== null && nextExpected.from === source) {
      stats.nextExpectedHits += 1;
      markEdge(nextExpected, passVersion);
      consumer.depsTail = nextExpected;
      return;
    }

    stats.fallbackScans += 1;
    passState.hadFallback = true;
    passState.fallbackScans += 1;

    const found = findReusableEdge(
      consumer,
      source,
      nextExpected,
      passVersion,
      strategy.wrappedSearch,
    );

    if (found.edge !== null) {
      stats.fallbackFoundExisting += 1;
      stats.fallbackScanStepsTotal += found.scanSteps;
      passState.fallbackScanStepsTotal += found.scanSteps;
      stats.fallbackScanStepsMax = Math.max(
        stats.fallbackScanStepsMax,
        found.scanSteps,
      );
      passState.fallbackScanStepsMax = Math.max(
        passState.fallbackScanStepsMax,
        found.scanSteps,
      );

      markEdge(found.edge, passVersion);
      if (found.wrappedHit) {
        stats.wrappedResolvedCount += 1;
        passState.wrappedResolvedCount += 1;
      }

      if (found.edge.prevIn !== prevEdge) {
        if (shouldReorder(strategy.policy, found.scanSteps)) {
          stats.fallbackReorders += 1;
          passState.fallbackReorders += 1;
          moveIncomingEdgeAfter(found.edge, consumer, prevEdge);
        } else {
          stats.fallbackSkippedReorders += 1;
        }
      }

      consumer.depsTail = found.edge;
      return;
    }

    stats.fallbackCreatedNew += 1;
    stats.fallbackScanStepsTotal += found.scanSteps;
    passState.fallbackScanStepsTotal += found.scanSteps;
    stats.fallbackScanStepsMax = Math.max(
      stats.fallbackScanStepsMax,
      found.scanSteps,
    );
    passState.fallbackScanStepsMax = Math.max(
      passState.fallbackScanStepsMax,
      found.scanSteps,
    );

    const edge = linkEdge(source, consumer, prevEdge);
    edge.mark = passVersion;
    passState.addedCount += 1;
    consumer.depsTail = edge;
    return;
  }

  const firstIn = consumer.firstIn;
  if (firstIn !== null && firstIn.from === source) {
    stats.headHits += 1;
    markEdge(firstIn, passVersion);
    consumer.depsTail = firstIn;
    return;
  }

  stats.fallbackScans += 1;
  passState.hadFallback = true;
  passState.fallbackScans += 1;

  const found = findReusableEdge(
    consumer,
    source,
    firstIn,
    passVersion,
    strategy.wrappedSearch,
  );

  if (found.edge !== null) {
    stats.fallbackFoundExisting += 1;
    stats.fallbackScanStepsTotal += found.scanSteps;
    passState.fallbackScanStepsTotal += found.scanSteps;
    stats.fallbackScanStepsMax = Math.max(
      stats.fallbackScanStepsMax,
      found.scanSteps,
    );
    passState.fallbackScanStepsMax = Math.max(
      passState.fallbackScanStepsMax,
      found.scanSteps,
    );

    markEdge(found.edge, passVersion);
    if (found.wrappedHit) {
      stats.wrappedResolvedCount += 1;
      passState.wrappedResolvedCount += 1;
    }

    if (found.edge.prevIn !== null) {
      if (shouldReorder(strategy.policy, found.scanSteps)) {
        stats.fallbackReorders += 1;
        passState.fallbackReorders += 1;
        moveIncomingEdgeAfter(found.edge, consumer, null);
      } else {
        stats.fallbackSkippedReorders += 1;
      }
    }

    consumer.depsTail = found.edge;
    return;
  }

  stats.fallbackCreatedNew += 1;
  stats.fallbackScanStepsTotal += found.scanSteps;
  passState.fallbackScanStepsTotal += found.scanSteps;
  stats.fallbackScanStepsMax = Math.max(
    stats.fallbackScanStepsMax,
    found.scanSteps,
  );
  passState.fallbackScanStepsMax = Math.max(
    passState.fallbackScanStepsMax,
    found.scanSteps,
  );

  const edge = linkEdge(source, consumer, null);
  edge.mark = passVersion;
  passState.addedCount += 1;
  consumer.depsTail = edge;
}

function cleanupSuffix(node, stats) {
  stats.cleanupCalls += 1;
  const tail = node.depsTail;
  let staleHead;

  if (tail !== null) {
    staleHead = tail.nextIn;
    if (staleHead === null) {
      stats.cleanupNoops += 1;
      return {
        keptCount: 0,
        removedCount: 0,
        visitedCount: 0,
      };
    }

    tail.nextIn = null;
    node.lastIn = tail;
  } else {
    staleHead = node.firstIn;
    if (staleHead === null) {
      stats.cleanupNoops += 1;
      return {
        keptCount: 0,
        removedCount: 0,
        visitedCount: 0,
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

  stats.cleanupRemovedEdgesTotal += removed;
  stats.cleanupRemovedEdgesMax = Math.max(stats.cleanupRemovedEdgesMax, removed);
  stats.cleanupVisitedEdgesTotal += visited;
  stats.cleanupVisitedEdgesMax = Math.max(stats.cleanupVisitedEdgesMax, visited);
  unlinkDetachedIncomingEdgeSequence(staleHead);
  return {
    keptCount: 0,
    removedCount: removed,
    visitedCount: visited,
  };
}

function cleanupMarkSweep(node, passVersion, stats) {
  stats.cleanupCalls += 1;
  let edge = node.firstIn;
  let removed = 0;
  let visited = 0;
  let kept = 0;

  while (edge !== null) {
    const next = edge.nextIn;
    visited += 1;

    if (edge.mark === passVersion) {
      kept += 1;
    } else {
      removed += 1;
      unlinkEdge(edge);
    }

    edge = next;
  }

  if (removed === 0) {
    stats.cleanupNoops += 1;
  }

  stats.cleanupRemovedEdgesTotal += removed;
  stats.cleanupRemovedEdgesMax = Math.max(stats.cleanupRemovedEdgesMax, removed);
  stats.cleanupVisitedEdgesTotal += visited;
  stats.cleanupVisitedEdgesMax = Math.max(stats.cleanupVisitedEdgesMax, visited);
  stats.cleanupKeptEdgesTotal += kept;
  return {
    keptCount: kept,
    removedCount: removed,
    visitedCount: visited,
  };
}

function createLifecycleGraph(fanIn) {
  const consumer = createConsumer();
  const sources = [];

  for (let i = 0; i < fanIn; i += 1) {
    const source = createProducer(i);
    sources.push(source);
    const edge = linkEdge(source, consumer);
    edge.mark = 0;
  }

  return { consumer, sources };
}

function estimateReadsPerPass(config) {
  switch (config.kind) {
    case "branch_half":
      return getBranchCount(config.fanIn);
    case "oscillate_rotate_branch":
      return (config.fanIn + getBranchCount(config.fanIn)) / 2;
    case "stable_then_drop":
      return (
        (config.phaseLength * config.fanIn + (config.fanIn - getDropCount(config.fanIn))) /
        (config.phaseLength + 1)
      );
    default:
      return config.fanIn;
  }
}

function createLifecycleScenario(config, policyId) {
  const normalizedPolicyId = normalizePolicyId(policyId);
  const policy = POLICY_MAP.get(normalizedPolicyId);
  if (!policy) throw new Error(`Unknown policy: ${policyId}`);

  const { consumer, sources } = createLifecycleGraph(config.fanIn);
  const getReadIndices = createReadPlanner(config);
  const adaptiveState =
    normalizedPolicyId === "adaptive_rotate_guard" ? createAdaptiveState() : null;
  let edgeCount = config.fanIn;

  return {
    readsPerPass: estimateReadsPerPass(config),
    run(stats, cleanupStats, passVersion) {
      const strategy = resolveStrategy(normalizedPolicyId, adaptiveState);
      const passState = {
        addedCount: 0,
        fallbackReorders: 0,
        fallbackScanStepsMax: 0,
        fallbackScanStepsTotal: 0,
        fallbackScans: 0,
        hadFallback: false,
        oldCount: edgeCount,
        reads: 0,
        strategy,
        wrappedResolvedCount: 0,
      };
      const readIndices = getReadIndices();
      consumer.depsTail = null;
      stats.recomputes += 1;

      for (let i = 0; i < readIndices.length; i += 1) {
        trackReadLifecycle(
          sources[readIndices[i]],
          consumer,
          strategy.policy,
          passState,
          passVersion,
          stats,
        );
      }

      let cleanupResult;
      if (strategy.cleanup === "suffix") {
        cleanupResult = cleanupSuffix(consumer, cleanupStats);
      } else {
        cleanupResult = cleanupMarkSweep(consumer, passVersion, cleanupStats);
      }

      const removedCount = cleanupResult.removedCount;
      edgeCount += passState.addedCount - removedCount;
      finalizePass(passState, stats);

      if (adaptiveState !== null) {
        const newCount = edgeCount;
        const retainedCount = Math.max(0, passState.oldCount - removedCount);
        const unionCount = passState.oldCount + newCount - retainedCount;
        const fallbackRate =
          passState.reads === 0 ? 0 : passState.fallbackScans / passState.reads;
        const fallbackAvgScanLen =
          passState.fallbackScans === 0
            ? 0
            : passState.fallbackScanStepsTotal / passState.fallbackScans;
        const setChurnRate =
          Math.max(passState.oldCount, newCount, 1) === 0
            ? 0
            : (passState.addedCount + removedCount) /
              Math.max(passState.oldCount, newCount, 1);
        const retentionRate =
          passState.oldCount === 0 ? 1 : retainedCount / passState.oldCount;
        const removeRate =
          passState.oldCount === 0 ? 0 : removedCount / passState.oldCount;
        const wrappedResolvedRate =
          passState.reads === 0
            ? 0
            : passState.wrappedResolvedCount / passState.reads;
        const scanWorkPerRead =
          passState.reads === 0
            ? 0
            : passState.fallbackScanStepsTotal / passState.reads;
        const passMetrics = {
          cleanupRemoved: removedCount,
          cleanupVisited: cleanupResult.visitedCount,
          fallbackRate: round(fallbackRate, 4),
          mode: strategy.mode,
          reads: passState.reads,
          scanWork: passState.fallbackScanStepsTotal,
          setChurnRate: round(setChurnRate, 4),
          wrappedResolvedRate: round(wrappedResolvedRate, 4),
        };

        recordAdaptivePass(adaptiveState, passMetrics);

        maybeUpdateAdaptiveMode(
          adaptiveState,
          {
            addedCount: passState.addedCount,
            fallbackAvgScanLen: round(fallbackAvgScanLen, 4),
            fallbackRate: round(fallbackRate, 4),
            mode: strategy.mode,
            newCount,
            oldCount: passState.oldCount,
            overlapRate:
              unionCount === 0 ? 1 : round(retainedCount / unionCount, 4),
            removeRate: round(removeRate, 4),
            removedCount,
            retainedCount,
            retentionRate: round(retentionRate, 4),
            scanWorkPerRead: round(scanWorkPerRead, 4),
            setChurnRate: round(setChurnRate, 4),
            wrappedResolvedRate: round(wrappedResolvedRate, 4),
          },
          passVersion,
        );
      }

      return readIndices[readIndices.length - 1] & 1;
    },
    profile(iterations) {
      const tracking = createTrackingStats();
      const cleanup = createCleanupStats(policy.cleanup);

      for (let pass = 1; pass <= iterations; pass += 1) {
        this.run(tracking, cleanup, pass);
      }

      if (adaptiveState !== null) {
        for (const pending of adaptiveState.pendingPostWindows) {
          pending.target.postWindow = summarizePassWindow(pending.entries);
          pending.target.postWindowPartial = true;
        }
        adaptiveState.pendingPostWindows.length = 0;
      }

      const report = {
        workload: config.kind,
        policy: normalizedPolicyId,
        requestedPolicy: policyId,
        cleanupMode:
          normalizedPolicyId === "adaptive_rotate_guard" ? "adaptive" : policy.cleanup,
        fanIn: config.fanIn,
        phaseLength: config.phaseLength || null,
        iterations,
        tracking: summarizeTrackingStats(tracking),
        cleanup: summarizeCleanupStats(cleanup),
      };

      if (adaptiveState !== null) {
        const economics = summarizeSwitchEconomics(adaptiveState.modeSwitches);
        report.adaptive = {
          blockedExitSignals: adaptiveState.blockedExitSignals,
          config: adaptiveState.config,
          currentMode: adaptiveState.mode,
          stablePasses: adaptiveState.stablePasses,
          churnPasses: adaptiveState.churnPasses,
          economics,
          emergencyExitCount: adaptiveState.emergencyExitCount,
          perModeTotals: adaptiveState.perModeTotals,
          modeSwitchCount: adaptiveState.modeSwitches.length,
          modeSwitches: adaptiveState.modeSwitches,
          passesInCurrentMode: adaptiveState.passesInCurrentMode,
          role: adaptiveState.config.role,
        };
      }

      return report;
    },
    bench() {
      const tracking = createTrackingStats();
      const cleanup = createCleanupStats(policy.cleanup);
      let passVersion = 0;

      return () => {
        passVersion += 1;
        return this.run(tracking, cleanup, passVersion);
      };
    },
  };
}

function printProfile(report) {
  console.log(JSON.stringify(report, null, 2));
}

function runBenchScenario(kind, fanIn, policyId, phaseLength) {
  const config = createWorkloadConfig(kind, fanIn, phaseLength);
  const scenario = createLifecycleScenario(config, policyId);

  benchLifecycle(
    `${kind}_${fanIn}:${policyId}`,
    scenario.bench(),
    config.iterations,
    config.warmup,
    scenario.readsPerPass,
  );
}

function runCompareScenario(kind, fanIn, phaseLength) {
  for (const policy of POLICIES) {
    runBenchScenario(kind, fanIn, policy.id, phaseLength);
  }
}

function runProfileScenario(kind, fanIn, policyId, iterations, phaseLength) {
  const config = createWorkloadConfig(kind, fanIn, phaseLength);
  const scenario = createLifecycleScenario(config, policyId);
  printProfile(scenario.profile(iterations));
}

function parseOptionalPhaseLength(input, kind) {
  if (input === undefined) return getDefaultPhaseLength(kind);

  const phaseLength = Number(input);
  if (!Number.isInteger(phaseLength) || phaseLength < 0) {
    throw new Error(`Invalid phaseLength: ${input}`);
  }
  return phaseLength;
}

function main() {
  const mode = process.argv[2] ?? "compare";

  if (mode === "scenario") {
    const kind = process.argv[3];
    const policyId = normalizePolicyId(process.argv[4]);
    const fanIn = Number(process.argv[5] ?? "32");
    const phaseLength = parseOptionalPhaseLength(process.argv[6], kind);

    if (!kind || !policyId) {
      throw new Error("scenario workload kind and policy are required");
    }
    if (!POLICY_MAP.has(policyId)) {
      throw new Error(`Unknown policy: ${policyId}`);
    }
    if (!Number.isInteger(fanIn) || fanIn <= 0) {
      throw new Error(`Invalid fanIn: ${process.argv[5]}`);
    }

    runBenchScenario(kind, fanIn, policyId, phaseLength);
    return;
  }

  if (mode === "compare") {
    const kind = process.argv[3] ?? "rotate";
    const fanIn = Number(process.argv[4] ?? "32");
    const phaseLength = parseOptionalPhaseLength(process.argv[5], kind);

    if (!Number.isInteger(fanIn) || fanIn <= 0) {
      throw new Error(`Invalid fanIn: ${process.argv[4]}`);
    }

    runCompareScenario(kind, fanIn, phaseLength);
    return;
  }

  if (mode === "profile") {
    const kind = process.argv[3];
    const policyId = normalizePolicyId(process.argv[4]);
    const fanIn = Number(process.argv[5] ?? "32");
    const iterations = Number(process.argv[6] ?? "5000");
    const phaseLength = parseOptionalPhaseLength(process.argv[7], kind);

    if (!kind || !policyId) {
      throw new Error("profile workload kind and policy are required");
    }
    if (!POLICY_MAP.has(policyId)) {
      throw new Error(`Unknown policy: ${policyId}`);
    }
    if (!Number.isInteger(fanIn) || fanIn <= 0) {
      throw new Error(`Invalid fanIn: ${process.argv[5]}`);
    }
    if (!Number.isFinite(iterations) || iterations <= 0) {
      throw new Error("profile iterations must be a positive number");
    }

    runProfileScenario(
      kind,
      fanIn,
      policyId,
      Math.trunc(iterations),
      phaseLength,
    );
    return;
  }

  throw new Error(`Unknown mode: ${mode}`);
}

main();
