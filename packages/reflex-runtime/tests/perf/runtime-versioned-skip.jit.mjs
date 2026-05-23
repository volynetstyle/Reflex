import { performance } from "node:perf_hooks";
import {
  ConsumerReadMode,
  readConsumer,
  readProducer,
  writeProducer,
} from "../../build/esm/api/index.js";
import { createExecutionContext } from "../../build/esm/reactivity/context.js";
import ReactiveNode, {
  UNINITIALIZED,
} from "../../build/esm/reactivity/shape/ReactiveNode.js";
import {
  CONSUMER_CHANGED,
  PRODUCER_INITIAL_STATE,
} from "../../build/esm/reactivity/shape/ReactiveMeta.js";

const WORKLOAD_KINDS = new Set([
  "rotate",
  "mixed",
  "stable_then_drop",
  "oscillate_rotate_branch",
]);

function createProducer(value) {
  return new ReactiveNode(value, null, PRODUCER_INITIAL_STATE);
}

function createConsumer(compute) {
  return new ReactiveNode(UNINITIALIZED, compute, CONSUMER_CHANGED);
}

function warm(fn, iterations) {
  let sink = 0;

  for (let i = 0; i < iterations; i += 1) {
    sink ^= fn(i) & 1;
  }

  return sink;
}

function benchScenario(label, runner) {
  warm(() => runner.runWarmup(), runner.warmup);

  if (globalThis.gc) globalThis.gc();

  let sink = 0;
  const start = performance.now();

  for (let i = 0; i < runner.iterations; i += 1) {
    sink ^= runner.runMeasure(i) & 1;
  }

  const elapsedMs = performance.now() - start;
  const nsPerPass = (elapsedMs * 1e6) / runner.iterations;
  const nsPerRead = (elapsedMs * 1e6) / runner.totalMeasuredReads;

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

function getDefaultPhaseLength(kind) {
  switch (kind) {
    case "mixed":
      return 8;
    case "stable_then_drop":
    case "oscillate_rotate_branch":
      return 20;
    default:
      return 0;
  }
}

function getDefaultIterations(kind, fanIn) {
  switch (kind) {
    case "rotate":
      return fanIn <= 64 ? 30000 : 15000;
    case "mixed":
      return fanIn <= 64 ? 30000 : 15000;
    case "stable_then_drop":
      return fanIn <= 64 ? 30000 : 15000;
    case "oscillate_rotate_branch":
      return fanIn <= 64 ? 20000 : 10000;
    default:
      return 20000;
  }
}

function createWorkloadConfig(kind, fanIn, phaseLength = getDefaultPhaseLength(kind)) {
  if (!WORKLOAD_KINDS.has(kind)) {
    throw new Error(`Unknown workload kind: ${kind}`);
  }

  const iterations = getDefaultIterations(kind, fanIn);

  return {
    fanIn,
    kind,
    iterations,
    phaseLength,
    warmup: Math.max(5000, Math.floor(iterations / 2)),
  };
}

function createReadPlanner(config) {
  const baseOrder = createBaseOrder(config.fanIn);
  const rotations = createRotations(config.fanIn);
  const branchCount = Math.max(1, Math.floor(config.fanIn / 2));
  const firstHalf = baseOrder.slice(0, branchCount);
  const secondHalf = baseOrder.slice(branchCount);
  const retainedOrder = baseOrder.slice(0, config.fanIn - branchCount);
  let iteration = 0;
  let offset = 0;
  let branchToggle = false;

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
      case "stable_then_drop": {
        const cycleLength = config.phaseLength + 1;
        const phaseIndex = iteration % cycleLength;
        iteration += 1;
        return phaseIndex === config.phaseLength ? retainedOrder : baseOrder;
      }
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
      default:
        throw new Error(`Unknown workload kind: ${config.kind}`);
    }
  };
}

function buildReadPlan(config, totalPasses) {
  const getReadIndices = createReadPlanner(config);
  const passes = new Array(totalPasses);

  for (let i = 0; i < totalPasses; i += 1) {
    passes[i] = getReadIndices().slice();
  }

  return passes;
}

function createScenario(config, versionedCleanupSkip) {
  const totalPasses = 1 + config.warmup + config.iterations;
  const passes = buildReadPlan(config, totalPasses);
  const context = createExecutionContext({}, { versionedCleanupSkip });
  const driver = createProducer(0);
  const sources = new Array(config.fanIn);
  let currentPass = 0;

  for (let i = 0; i < config.fanIn; i += 1) {
    sources[i] = createProducer(i + 1);
  }

  const root = createConsumer(() => {
    readProducer(driver, context);
    const readIndices = passes[currentPass];
    currentPass += 1;
    let sum = 0;

    for (let i = 0; i < readIndices.length; i += 1) {
      sum += readProducer(sources[readIndices[i]], context);
    }

    return sum;
  });

  readConsumer(root, ConsumerReadMode.lazy, context);

  let nextDriverValue = 1;
  let totalMeasuredReads = 0;

  for (let i = 1 + config.warmup; i < passes.length; i += 1) {
    totalMeasuredReads += passes[i].length;
  }

  return {
    iterations: config.iterations,
    totalMeasuredReads,
    warmup: config.warmup,
    runWarmup() {
      writeProducer(driver, nextDriverValue++, context);
      return readConsumer(root, ConsumerReadMode.lazy, context);
    },
    runMeasure() {
      writeProducer(driver, nextDriverValue++, context);
      return readConsumer(root, ConsumerReadMode.lazy, context);
    },
  };
}

function runCompare(kind, fanIn, phaseLength) {
  const config = createWorkloadConfig(kind, fanIn, phaseLength);
  const baseline = createScenario(config, false);
  const versioned = createScenario(config, true);

  benchScenario(`${kind}_${fanIn}:default_cleanup`, baseline);
  benchScenario(`${kind}_${fanIn}:versioned_cleanup_skip`, versioned);
}

function main() {
  const mode = process.argv[2] ?? "compare";

  if (mode !== "compare") {
    throw new Error(`Unknown mode: ${mode}`);
  }

  const kind = process.argv[3] ?? "rotate";
  const fanIn = Number(process.argv[4] ?? "128");
  const phaseLengthInput = process.argv[5];
  const phaseLength =
    phaseLengthInput === undefined
      ? getDefaultPhaseLength(kind)
      : Number(phaseLengthInput);

  if (!WORKLOAD_KINDS.has(kind)) {
    throw new Error(`Unknown workload kind: ${kind}`);
  }
  if (!Number.isInteger(fanIn) || fanIn <= 0) {
    throw new Error(`Invalid fanIn: ${process.argv[4]}`);
  }
  if (!Number.isInteger(phaseLength) || phaseLength < 0) {
    throw new Error(`Invalid phaseLength: ${phaseLengthInput}`);
  }

  runCompare(kind, fanIn, phaseLength);
}

main();
