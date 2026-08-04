import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { writeHeapSnapshot } from "node:v8";
import { Session } from "node:inspector";

import {
  createConsumer,
  createProducer,
  createWatcher,
  disposeWatcher,
  readConsumer,
  readProducer,
  resetRuntimeContext,
  runWatcher,
  writeProducer,
} from "../../dist/perf.js";

const VARIANTS = [
  "capture-index",
  "shared-state",
  "factory",
  "copied-value",
  "no-item-capture",
];
const KINDS = ["consumers", "watchers"];
const DEFAULT_COUNT = 10_000;
const DEFAULT_TRIALS = 5;
const SCRIPT_PATH = fileURLToPath(import.meta.url);

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument?.startsWith("--")) continue;
    const [key, inlineValue] = argument.slice(2).split("=", 2);
    values.set(key, inlineValue ?? argv[index + 1] ?? true);
    if (
      inlineValue === undefined &&
      argv[index + 1] &&
      !argv[index + 1].startsWith("--")
    ) {
      index += 1;
    }
  }
  return values;
}

function numberOption(options, name, fallback) {
  const value = Number(options.get(name) ?? fallback);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return value;
}

function fullGc() {
  if (typeof globalThis.gc !== "function") {
    throw new Error("Run this benchmark with --expose-gc");
  }
  for (let index = 0; index < 3; index += 1) globalThis.gc();
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function measureTrials(trials, operation) {
  const samples = [];
  for (let trial = 0; trial < trials; trial += 1) {
    const start = performance.now();
    operation(trial);
    samples.push(performance.now() - start);
  }
  return median(samples);
}

function inspectorPost(session, method, params = {}) {
  return new Promise((resolve, reject) => {
    session.post(method, params, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

function makeCallback(variant, source, index, sharedState, state) {
  switch (variant) {
    case "capture-index":
      // This is intentionally a let-bound callback. The semantic test makes
      // sure that every node retains its own index.
      return () => readProducer(source) + index;
    case "shared-state":
      return () => readProducer(source) + sharedState.value;
    case "factory":
      return makeIndexedCallback(source, index);
    case "copied-value": {
      const itemIndex = index;
      return () => readProducer(source) + itemIndex;
    }
    case "no-item-capture":
      return state.sharedCallback;
    default:
      throw new Error(`Unknown callback variant: ${variant}`);
  }
}

function makeIndexedCallback(source, index) {
  return () => readProducer(source) + index;
}

function createGraph(kind, variant, count) {
  resetRuntimeContext();
  const source = createProducer(0);
  const sharedState = { value: 0 };
  let cleanupCalls = 0;
  const state = { checksum: 0, sharedCallback: null, sharedCleanup: null };
  state.sharedCallback = () => readProducer(source);
  state.sharedCleanup = () => {
    cleanupCalls += 1;
  };
  const nodes = [];
  const sharedWatcher =
    variant === "no-item-capture"
      ? () => {
          state.checksum += state.sharedCallback();
          return state.sharedCleanup;
        }
      : null;

  for (let index = 0; index < count; index += 1) {
    if (kind === "watchers") {
      if (variant === "no-item-capture") {
        nodes.push(createWatcher(sharedWatcher));
      } else {
        const callback = makeCallback(
          variant,
          source,
          index,
          sharedState,
          state,
        );
        nodes.push(
          createWatcher(() => {
            const value = callback();
            state.checksum += value;
            return () => {
              cleanupCalls += 1;
              state.checksum ^= value | 0;
            };
          }),
        );
      }
    } else {
      nodes.push(
        createConsumer(
          makeCallback(variant, source, index, sharedState, state),
        ),
      );
    }
  }

  return {
    source,
    nodes,
    sharedState,
    state,
    get cleanupCalls() {
      return cleanupCalls;
    },
  };
}

function runInitial(graph, kind) {
  graph.state.checksum = 0;
  if (kind === "watchers") {
    for (const node of graph.nodes) runWatcher(node);
  } else {
    for (const node of graph.nodes) graph.state.checksum += readConsumer(node);
  }
  return graph.state.checksum;
}

function runPropagation(graph, kind) {
  graph.state.checksum = 0;
  if (kind === "watchers") {
    for (const node of graph.nodes) runWatcher(node);
  } else {
    for (const node of graph.nodes) graph.state.checksum += readConsumer(node);
  }
  return graph.state.checksum;
}

function expectedChecksum(variant, count, sourceValue) {
  if (variant === "no-item-capture" || variant === "shared-state") {
    return count * sourceValue;
  }
  return count * sourceValue + (count * (count - 1)) / 2;
}

function countEdges(source) {
  let count = 0;
  for (let edge = source.firstOut; edge !== null; edge = edge.nextOut)
    count += 1;
  return count;
}

function verifyGraph(graph, kind, variant, count, sourceValue) {
  const checksum = runPropagation(graph, kind);
  const expected = expectedChecksum(variant, count, sourceValue);
  if (kind === "consumers" && checksum !== expected) {
    throw new Error(
      `${variant} semantic checksum mismatch: expected ${expected}, got ${checksum}`,
    );
  }
  if (graph.nodes.length !== count || countEdges(graph.source) !== count) {
    throw new Error(
      `${variant} topology mismatch: nodes/edges must both equal ${count}`,
    );
  }
}

function measurePropagation(kind, variant, count, trials) {
  const graphs = Array.from({ length: trials }, () => {
    const graph = createGraph(kind, variant, count);
    runInitial(graph, kind);
    writeProducer(graph.source, 1);
    return graph;
  });
  const elapsed = measureTrials(trials, (trial) => {
    runPropagation(graphs[trial], kind);
  });
  for (const graph of graphs) graph.nodes.length = 0;
  resetRuntimeContext();
  return elapsed;
}

function measureDisposal(variant, count, trials) {
  const graphs = Array.from({ length: trials }, () => {
    const graph = createGraph("watchers", variant, count);
    runInitial(graph, "watchers");
    writeProducer(graph.source, 1);
    runPropagation(graph, "watchers");
    return graph;
  });
  const elapsed = measureTrials(trials, (trial) => {
    for (const node of graphs[trial].nodes) disposeWatcher(node);
  });
  for (const graph of graphs) graph.nodes.length = 0;
  resetRuntimeContext();
  return elapsed;
}

function runChild(options) {
  const count = numberOption(options, "count", DEFAULT_COUNT);
  const trials = numberOption(options, "trials", DEFAULT_TRIALS);
  const variant = String(options.get("variant"));
  const kind = String(options.get("kind"));
  if (!VARIANTS.includes(variant) || !KINDS.includes(kind)) {
    throw new Error(
      `Use --variant=<${VARIANTS.join("|")}> and --kind=<${KINDS.join("|")}>`,
    );
  }

  fullGc();
  const heapUsedBaselineBytes = process.memoryUsage().heapUsed;

  const creationMs = measureTrials(trials, () => {
    const graph = createGraph(kind, variant, count);
    resetRuntimeContext();
    return graph;
  });
  const initialMs = measureTrials(trials, () => {
    const graph = createGraph(kind, variant, count);
    runInitial(graph, kind);
    resetRuntimeContext();
  });

  const graph = createGraph(kind, variant, count);
  const initialChecksum = runInitial(graph, kind);
  if (
    kind === "consumers" &&
    initialChecksum !== expectedChecksum(variant, count, 0)
  ) {
    throw new Error(`${variant} initial semantic checksum mismatch`);
  }

  let nextValue = 1;
  const writeMs = measureTrials(trials, () => {
    writeProducer(graph.source, nextValue);
    nextValue += 1;
  });
  const propagationMs = measurePropagation(kind, variant, count, trials);
  const finalSourceValue = nextValue - 1;
  verifyGraph(graph, kind, variant, count, finalSourceValue);

  const cleanupMs =
    kind === "watchers" ? measureDisposal(variant, count, trials) : null;

  fullGc();
  const heapUsedRetainedBytes = process.memoryUsage().heapUsed;
  const snapshotDir = options.get("snapshot-dir");
  let snapshotPath = null;
  if (snapshotDir) {
    mkdirSync(String(snapshotDir), { recursive: true });
    snapshotPath = writeHeapSnapshot(
      `${snapshotDir}/${kind}-${variant}-${count}.heapsnapshot`,
    );
  }

  graph.nodes.length = 0;
  resetRuntimeContext();
  fullGc();
  const heapUsedReleasedBytes = process.memoryUsage().heapUsed;

  return {
    kind,
    variant,
    count,
    trials,
    phasesMs: {
      creation: creationMs,
      initialComputation: initialMs,
      mutationWrite: writeMs,
      propagationOrWatcherExecution: propagationMs,
      disposalCleanup: cleanupMs,
    },
    heapUsedRetainedBytes,
    heapUsedReleasedBytes,
    heapUsedBaselineBytes,
    retainedGraphBytes: heapUsedRetainedBytes - heapUsedBaselineBytes,
    retainedBytesPerNode: Math.round(
      (heapUsedRetainedBytes - heapUsedBaselineBytes) / count,
    ),
    topology: { nodes: count, sourceEdges: count },
    semantic: {
      initialChecksum,
      expectedChecksum: expectedChecksum(variant, count, 0),
      cleanupCalls: graph.cleanupCalls,
    },
    snapshotPath,
  };
}

async function runChildWithAllocationSampling(options) {
  const session = new Session();
  session.connect();
  await inspectorPost(session, "HeapProfiler.startSampling", {
    samplingInterval: 512,
  });

  try {
    const result = runChild(options);
    const profile = await inspectorPost(session, "HeapProfiler.stopSampling");
    const outputDir = String(
      options.get("snapshot-dir") ?? "bench-results/callback-memory",
    );
    mkdirSync(outputDir, { recursive: true });
    const profilePath = `${outputDir}/allocation-${result.kind}-${result.variant}-${result.count}.json`;
    writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`);
    result.allocationProfilePath = profilePath;
    return result;
  } finally {
    session.disconnect();
  }
}

function runMatrix(options) {
  const count = numberOption(options, "count", DEFAULT_COUNT);
  const trials = numberOption(options, "trials", DEFAULT_TRIALS);
  const variants = options.get("variant")
    ? [String(options.get("variant"))]
    : VARIANTS;
  const kinds = options.get("kind") ? [String(options.get("kind"))] : KINDS;
  const results = [];

  for (const kind of kinds) {
    for (const variant of variants) {
      const childArgs = [
        "--expose-gc",
        SCRIPT_PATH,
        "--child",
        `--count=${count}`,
        `--trials=${trials}`,
        `--kind=${kind}`,
        `--variant=${variant}`,
      ];
      if (options.get("snapshot-dir"))
        childArgs.push(`--snapshot-dir=${options.get("snapshot-dir")}`);
      if (options.has("allocation-sampling"))
        childArgs.push("--allocation-sampling");
      const child = spawnSync(process.execPath, childArgs, {
        encoding: "utf8",
      });
      if (child.status !== 0) {
        process.stderr.write(child.stderr);
        throw new Error(
          `Callback memory benchmark failed for ${kind}/${variant}`,
        );
      }
      results.push(JSON.parse(child.stdout));
    }
  }

  if (options.get("json")) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    return;
  }

  console.table(
    results.map((result) => ({
      kind: result.kind,
      variant: result.variant,
      nodes: result.count,
      createMs: result.phasesMs.creation.toFixed(2),
      initialMs: result.phasesMs.initialComputation.toFixed(2),
      writeMs: result.phasesMs.mutationWrite.toFixed(2),
      executeMs: result.phasesMs.propagationOrWatcherExecution.toFixed(2),
      cleanupMs: result.phasesMs.disposalCleanup?.toFixed(2) ?? "n/a",
      retainedKiB: Math.round(result.retainedGraphBytes / 1024),
      bytesPerNode: result.retainedBytesPerNode,
    })),
  );
  console.log(
    "Semantic checksum and topology checks passed for every scenario.",
  );
}

const options = parseArgs(process.argv.slice(2));
if (options.has("child")) {
  const result = options.has("allocation-sampling")
    ? await runChildWithAllocationSampling(options)
    : runChild(options);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} else {
  runMatrix(options);
}
