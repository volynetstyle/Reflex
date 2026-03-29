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
} from "../../build/esm/reactivity/shape/methods/connect.js";

const POLICIES = [
  { id: "reorder_always" },
  { id: "find_only" },
  { id: "reorder_scan_gt_1" },
  { id: "reorder_after_fallback_streak_3" },
];

const POLICY_MAP = new Map(POLICIES.map((policy) => [policy.id, policy]));

const WORKLOAD_KINDS = new Set([
  "static",
  "rotate",
  "mixed",
  "alt_ab",
  "swap_small",
  "branch_half",
  "prefix_suffix_chaotic",
]);

const DEFAULT_FAN_INS = [8, 16, 32, 64, 128];
const DEFAULT_COMPARE_WORKLOADS = [
  "static",
  "rotate",
  "mixed",
  "alt_ab",
  "swap_small",
  "branch_half",
  "prefix_suffix_chaotic",
];

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

function round(value, digits = 2) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
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
    fallbackScanStepsTotal: 0,
    fallbackScanStepsMax: 0,
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
    fallbackReorderRate:
      stats.fallbackFoundExisting === 0
        ? 0
        : round(stats.fallbackReorders / stats.fallbackFoundExisting, 4),
  };
}

function shouldReorder(policyId, scanSteps, policyState) {
  switch (policyId) {
    case "reorder_always":
      return true;
    case "find_only":
      return false;
    case "reorder_scan_gt_1":
      return scanSteps > 1;
    case "reorder_after_fallback_streak_3":
      return policyState.fallbackPassStreak >= 2;
    default:
      throw new Error(`Unknown policy: ${policyId}`);
  }
}

function usesWrappedFallbackScan(policyId) {
  return policyId !== "reorder_always";
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
      return { edge, scanSteps };
    }
  }

  if (wrapped && scanStart !== consumer.firstIn) {
    for (let edge = consumer.firstIn; edge !== scanStart; edge = edge.nextIn) {
      scanSteps += 1;
      if (edge.from === source && edge.mark !== passVersion) {
        return { edge, scanSteps };
      }
    }
  }

  return { edge: null, scanSteps };
}

function finalizePass(passState, policyState, stats) {
  if (passState.hadFallback) {
    policyState.fallbackPassStreak += 1;
    if (stats) stats.recomputesWithFallback += 1;
  } else {
    policyState.fallbackPassStreak = 0;
  }
}

function trackReadWithPolicy(
  source,
  consumer,
  policyId,
  policyState,
  passState,
  passVersion,
  countUniqueTouched = false,
) {
  const prevEdge = consumer.depsTail;
  if (prevEdge !== null) {
    if (prevEdge.from === source) {
      if (countUniqueTouched && prevEdge.mark !== passVersion) {
        passState.uniqueTouched += 1;
      }
      prevEdge.mark = passVersion;
      return;
    }

    const nextExpected = prevEdge.nextIn;
    if (nextExpected !== null && nextExpected.from === source) {
      if (countUniqueTouched && nextExpected.mark !== passVersion) {
        passState.uniqueTouched += 1;
      }
      nextExpected.mark = passVersion;
      consumer.depsTail = nextExpected;
      return;
    }

    passState.hadFallback = true;

    const wrapped = usesWrappedFallbackScan(policyId);
    const found = findReusableEdge(
      consumer,
      source,
      nextExpected,
      passVersion,
      wrapped,
    );

    if (found.edge !== null) {
      if (countUniqueTouched && found.edge.mark !== passVersion) {
        passState.uniqueTouched += 1;
      }
      if (
        found.edge.prevIn !== prevEdge &&
        shouldReorder(policyId, found.scanSteps, policyState)
      ) {
        moveIncomingEdgeAfter(found.edge, consumer, prevEdge);
      }

      found.edge.mark = passVersion;
      consumer.depsTail = found.edge;
      return;
    }

    const edge = linkEdge(source, consumer, prevEdge);
    if (countUniqueTouched) {
      passState.uniqueTouched += 1;
    }
    edge.mark = passVersion;
    consumer.depsTail = edge;
    return;
  }

  const firstIn = consumer.firstIn;
  if (firstIn !== null && firstIn.from === source) {
    if (countUniqueTouched && firstIn.mark !== passVersion) {
      passState.uniqueTouched += 1;
    }
    firstIn.mark = passVersion;
    consumer.depsTail = firstIn;
    return;
  }

  passState.hadFallback = true;

  const found = findReusableEdge(
    consumer,
    source,
    firstIn,
    passVersion,
    usesWrappedFallbackScan(policyId),
  );

  if (found.edge !== null) {
    if (countUniqueTouched && found.edge.mark !== passVersion) {
      passState.uniqueTouched += 1;
    }
    if (
      found.edge.prevIn !== null &&
      shouldReorder(policyId, found.scanSteps, policyState)
    ) {
      moveIncomingEdgeAfter(found.edge, consumer, null);
    }

    found.edge.mark = passVersion;
    consumer.depsTail = found.edge;
    return;
  }

  const edge = linkEdge(source, consumer, null);
  if (countUniqueTouched) {
    passState.uniqueTouched += 1;
  }
  edge.mark = passVersion;
  consumer.depsTail = edge;
}

function trackReadWithPolicyProfile(
  source,
  consumer,
  policyId,
  policyState,
  passState,
  stats,
  passVersion,
) {
  stats.reads += 1;

  const prevEdge = consumer.depsTail;
  if (prevEdge !== null) {
    if (prevEdge.from === source) {
      stats.sameEdgeHits += 1;
      prevEdge.mark = passVersion;
      return;
    }

    const nextExpected = prevEdge.nextIn;
    if (nextExpected !== null && nextExpected.from === source) {
      stats.nextExpectedHits += 1;
      nextExpected.mark = passVersion;
      consumer.depsTail = nextExpected;
      return;
    }

    stats.fallbackScans += 1;
    passState.hadFallback = true;

    const found = findReusableEdge(
      consumer,
      source,
      nextExpected,
      passVersion,
      usesWrappedFallbackScan(policyId),
    );

    if (found.edge !== null) {
      stats.fallbackFoundExisting += 1;
      stats.fallbackScanStepsTotal += found.scanSteps;
      stats.fallbackScanStepsMax = Math.max(
        stats.fallbackScanStepsMax,
        found.scanSteps,
      );

      if (found.edge.prevIn !== prevEdge) {
        if (shouldReorder(policyId, found.scanSteps, policyState)) {
          stats.fallbackReorders += 1;
          moveIncomingEdgeAfter(found.edge, consumer, prevEdge);
        } else {
          stats.fallbackSkippedReorders += 1;
        }
      }

      found.edge.mark = passVersion;
      consumer.depsTail = found.edge;
      return;
    }

    stats.fallbackCreatedNew += 1;
    stats.fallbackScanStepsTotal += found.scanSteps;
    stats.fallbackScanStepsMax = Math.max(
      stats.fallbackScanStepsMax,
      found.scanSteps,
    );
    const edge = linkEdge(source, consumer, prevEdge);
    edge.mark = passVersion;
    consumer.depsTail = edge;
    return;
  }

  const firstIn = consumer.firstIn;
  if (firstIn !== null && firstIn.from === source) {
    stats.headHits += 1;
    firstIn.mark = passVersion;
    consumer.depsTail = firstIn;
    return;
  }

  stats.fallbackScans += 1;
  passState.hadFallback = true;

  const found = findReusableEdge(
    consumer,
    source,
    firstIn,
    passVersion,
    usesWrappedFallbackScan(policyId),
  );

  if (found.edge !== null) {
    stats.fallbackFoundExisting += 1;
    stats.fallbackScanStepsTotal += found.scanSteps;
    stats.fallbackScanStepsMax = Math.max(
      stats.fallbackScanStepsMax,
      found.scanSteps,
    );

    if (found.edge.prevIn !== null) {
      if (shouldReorder(policyId, found.scanSteps, policyState)) {
        stats.fallbackReorders += 1;
        moveIncomingEdgeAfter(found.edge, consumer, null);
      } else {
        stats.fallbackSkippedReorders += 1;
      }
    }

    found.edge.mark = passVersion;
    consumer.depsTail = found.edge;
    return;
  }

  stats.fallbackCreatedNew += 1;
  stats.fallbackScanStepsTotal += found.scanSteps;
  stats.fallbackScanStepsMax = Math.max(
    stats.fallbackScanStepsMax,
    found.scanSteps,
  );
  const edge = linkEdge(source, consumer, null);
  edge.mark = passVersion;
  consumer.depsTail = edge;
}

function createTrackingGraph(fanIn) {
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

function getDefaultPhaseLength(kind) {
  switch (kind) {
    case "mixed":
    case "branch_half":
      return 8;
    default:
      return 0;
  }
}

function getDefaultIterations(fanIn, kind) {
  switch (kind) {
    case "static":
      return fanIn <= 16 ? 200000 : fanIn <= 64 ? 120000 : 60000;
    case "rotate":
      return fanIn <= 16 ? 120000 : fanIn <= 64 ? 50000 : 20000;
    case "mixed":
    case "alt_ab":
    case "swap_small":
    case "branch_half":
    case "prefix_suffix_chaotic":
      return fanIn <= 16 ? 120000 : fanIn <= 64 ? 80000 : 30000;
    default:
      return 50000;
  }
}

function createWorkloadConfig(kind, fanIn, phaseLength = getDefaultPhaseLength(kind)) {
  if (!WORKLOAD_KINDS.has(kind)) {
    throw new Error(`Unknown workload kind: ${kind}`);
  }

  return {
    kind,
    fanIn,
    phaseLength,
    iterations: getDefaultIterations(fanIn, kind),
    warmup: Math.max(10000, Math.floor(getDefaultIterations(fanIn, kind) / 2)),
  };
}

function createReadPlanner(config) {
  const baseOrder = createBaseOrder(config.fanIn);
  const rotations = createRotations(config.fanIn);
  const reverseOrder = reverseIndices(config.fanIn);
  const swapOrder = baseOrder.slice();
  const chaoticOrder = baseOrder.slice();
  const nextInt = createXorshift32(
    (0x9e3779b9 ^ (config.fanIn << 8) ^ config.kind.length) >>> 0,
  );
  const branchCount = Math.max(1, Math.floor(config.fanIn / 2));
  const firstHalf = baseOrder.slice(0, branchCount);
  const secondHalf = baseOrder.slice(branchCount);
  const prefixCount = Math.max(1, Math.floor(config.fanIn / 4));
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
      case "mixed": {
        if (iteration !== 0 && iteration % config.phaseLength === 0) {
          offset = (offset + 1) % config.fanIn;
        }
        iteration += 1;
        return rotations[offset];
      }
      case "alt_ab": {
        const current = iteration % 2 === 0 ? baseOrder : reverseOrder;
        iteration += 1;
        return current;
      }
      case "swap_small": {
        if (config.fanIn > 1) {
          const swapsPerPass = Math.min(3, config.fanIn - 1);
          for (let i = 0; i < swapsPerPass; i += 1) {
            const position = nextInt() % (config.fanIn - 1);
            applyAdjacentSwap(swapOrder, position);
          }
        }
        return swapOrder;
      }
      case "branch_half": {
        if (iteration !== 0 && iteration % config.phaseLength === 0) {
          branchToggle = !branchToggle;
        }
        iteration += 1;
        return branchToggle ? secondHalf : firstHalf;
      }
      case "prefix_suffix_chaotic": {
        for (let i = 0; i < prefixCount; i += 1) {
          chaoticOrder[i] = baseOrder[i];
        }

        for (let i = prefixCount; i < config.fanIn; i += 1) {
          chaoticOrder[i] = baseOrder[i];
        }

        shuffleSlice(chaoticOrder, prefixCount, nextInt);
        return chaoticOrder;
      }
      default:
        throw new Error(`Unknown workload kind: ${config.kind}`);
    }
  };
}

function createWorkload(config) {
  const { consumer, sources } = createTrackingGraph(config.fanIn);
  const getReadIndices = createReadPlanner(config);

  return {
    fanIn: config.fanIn,
    readsPerPass: config.kind === "branch_half" ? Math.floor(config.fanIn / 2) : config.fanIn,
    passVersion: 0,
    run(policyId, policyState) {
      const passState = { hadFallback: false, uniqueTouched: 0 };
      const readIndices = getReadIndices();
      this.passVersion += 1;
      consumer.depsTail = null;

      for (let i = 0; i < readIndices.length; i += 1) {
        trackReadWithPolicy(
          sources[readIndices[i]],
          consumer,
          policyId,
          policyState,
          passState,
          this.passVersion,
        );
      }

      finalizePass(passState, policyState, null);
      return readIndices[readIndices.length - 1] & 1;
    },
    runWithUniqueTouched(policyId, policyState) {
      const passState = { hadFallback: false, uniqueTouched: 0 };
      const readIndices = getReadIndices();
      this.passVersion += 1;
      consumer.depsTail = null;

      for (let i = 0; i < readIndices.length; i += 1) {
        trackReadWithPolicy(
          sources[readIndices[i]],
          consumer,
          policyId,
          policyState,
          passState,
          this.passVersion,
          true,
        );
      }

      finalizePass(passState, policyState, null);
      return (
        (readIndices[readIndices.length - 1] ^ passState.uniqueTouched) & 1
      );
    },
    profile(policyId, iterations) {
      const stats = createTrackingStats();
      const policyState = { fallbackPassStreak: 0 };

      for (let pass = 0; pass < iterations; pass += 1) {
        const passState = { hadFallback: false, uniqueTouched: 0 };
        const readIndices = getReadIndices();
        this.passVersion += 1;
        consumer.depsTail = null;
        stats.recomputes += 1;

        for (let i = 0; i < readIndices.length; i += 1) {
          trackReadWithPolicyProfile(
            sources[readIndices[i]],
            consumer,
            policyId,
            policyState,
            passState,
            stats,
            this.passVersion,
          );
        }

        finalizePass(passState, policyState, stats);
      }

      return {
        workload: config.kind,
        policy: policyId,
        fanIn: config.fanIn,
        phaseLength: config.phaseLength || null,
        iterations,
        tracking: summarizeTrackingStats(stats),
      };
    },
  };
}

function printProfile(report) {
  console.log(JSON.stringify(report, null, 2));
}

function runDefaultBenchSuite() {
  for (const workloadKind of ["static", "rotate", "mixed"]) {
    const config = createWorkloadConfig(workloadKind, 32);

    for (const policy of POLICIES) {
      const scenario = createWorkload(config);
      const policyState = { fallbackPassStreak: 0 };

      bench(
        `${workloadKind}_32:${policy.id}`,
        () => scenario.run(policy.id, policyState),
        config.iterations,
        config.warmup,
        scenario.readsPerPass,
        "read",
      );
    }
  }
}

function runBenchScenario(kind, fanIn, policyId, phaseLength) {
  const config = createWorkloadConfig(kind, fanIn, phaseLength);
  const scenario = createWorkload(config);
  const policyState = { fallbackPassStreak: 0 };

  bench(
    `${kind}_${fanIn}:${policyId}`,
    () => scenario.run(policyId, policyState),
    config.iterations,
    config.warmup,
    scenario.readsPerPass,
    "read",
  );
}

function runCompareScenario(kind, fanIn, phaseLength) {
  for (const policy of POLICIES) {
    runBenchScenario(kind, fanIn, policy.id, phaseLength);
  }
}

function runSweepScenario(fanIns, kind, phaseLength) {
  for (const fanIn of fanIns) {
    runCompareScenario(kind, fanIn, phaseLength);
  }
}

function runProfileScenario(kind, fanIn, policyId, iterations, phaseLength) {
  const config = createWorkloadConfig(kind, fanIn, phaseLength);
  const scenario = createWorkload(config);
  printProfile(scenario.profile(policyId, iterations));
}

function runUniqueTouchedCompare(kind, fanIn, policyId, phaseLength) {
  const config = createWorkloadConfig(kind, fanIn, phaseLength);
  const baselineScenario = createWorkload(config);
  const countedScenario = createWorkload(config);
  const baselinePolicyState = { fallbackPassStreak: 0 };
  const countedPolicyState = { fallbackPassStreak: 0 };

  bench(
    `${kind}_${fanIn}:${policyId}:baseline`,
    () => baselineScenario.run(policyId, baselinePolicyState),
    config.iterations,
    config.warmup,
    baselineScenario.readsPerPass,
    "read",
  );

  bench(
    `${kind}_${fanIn}:${policyId}:unique_touched`,
    () => countedScenario.runWithUniqueTouched(policyId, countedPolicyState),
    config.iterations,
    config.warmup,
    countedScenario.readsPerPass,
    "read",
  );
}

function parseFanIns(input) {
  if (!input) return DEFAULT_FAN_INS;

  return input.split(",").map((value) => {
    const fanIn = Number(value);
    if (!Number.isInteger(fanIn) || fanIn <= 0) {
      throw new Error(`Invalid fanIn value: ${value}`);
    }
    return fanIn;
  });
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
  const mode = process.argv[2] ?? "bench";

  if (mode === "bench") {
    runDefaultBenchSuite();
    return;
  }

  if (mode === "scenario") {
    const kind = process.argv[3];
    const policyId = process.argv[4];
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
    const kind = process.argv[3];
    const fanIn = Number(process.argv[4] ?? "32");
    const phaseLength = parseOptionalPhaseLength(process.argv[5], kind);

    if (!kind) {
      throw new Error("compare workload kind is required");
    }
    if (!Number.isInteger(fanIn) || fanIn <= 0) {
      throw new Error(`Invalid fanIn: ${process.argv[4]}`);
    }

    runCompareScenario(kind, fanIn, phaseLength);
    return;
  }

  if (mode === "sweep") {
    const kind = process.argv[3] ?? "rotate";
    const fanIns = parseFanIns(process.argv[4]);
    const phaseLength = parseOptionalPhaseLength(process.argv[5], kind);
    runSweepScenario(fanIns, kind, phaseLength);
    return;
  }

  if (mode === "profile") {
    const kind = process.argv[3];
    const policyId = process.argv[4];
    const fanIn = Number(process.argv[5] ?? "32");
    const iterations = Number(process.argv[6] ?? "10000");
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

  if (mode === "unique_touched_compare") {
    const kind = process.argv[3];
    const policyId = process.argv[4];
    const fanIn = Number(process.argv[5] ?? "32");
    const phaseLength = parseOptionalPhaseLength(process.argv[6], kind);

    if (!kind || !policyId) {
      throw new Error(
        "unique_touched_compare workload kind and policy are required",
      );
    }
    if (!POLICY_MAP.has(policyId)) {
      throw new Error(`Unknown policy: ${policyId}`);
    }
    if (!Number.isInteger(fanIn) || fanIn <= 0) {
      throw new Error(`Invalid fanIn: ${process.argv[5]}`);
    }

    runUniqueTouchedCompare(kind, fanIn, policyId, phaseLength);
    return;
  }

  if (mode === "catalog") {
    console.log(
      JSON.stringify(
        {
          fanIns: DEFAULT_FAN_INS,
          workloads: DEFAULT_COMPARE_WORKLOADS,
          policies: POLICIES.map((policy) => policy.id),
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
