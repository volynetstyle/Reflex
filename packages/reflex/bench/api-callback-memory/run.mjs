import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { writeHeapSnapshot } from "node:v8";

import {
  computed,
  createRuntime,
  effect,
  signal,
} from "../../dist/esm/index.js";

const VARIANTS = [
  "capture-index",
  "shared-state",
  "factory",
  "copied-value",
  "no-item-capture",
];
const KINDS = ["computed", "effects"];
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

function positiveInt(options, name, fallback) {
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

function indexedCallback(variant, readSource, index, sharedState) {
  switch (variant) {
    case "capture-index":
      return () => readSource() + index;
    case "shared-state":
      return () => readSource() + sharedState.value;
    case "factory":
      return makeIndexedCallback(readSource, index);
    case "copied-value": {
      const itemIndex = index;
      return () => readSource() + itemIndex;
    }
    case "no-item-capture":
      return sharedState.callback;
    default:
      throw new Error(`Unknown callback variant: ${variant}`);
  }
}

function makeIndexedCallback(readSource, index) {
  return () => readSource() + index;
}

function createGraph(kind, variant, count) {
  const runtime = createRuntime({ effectStrategy: "flush" });
  const [readSource, setSource] = signal(0);
  const sharedState = { value: 0, callback: null };
  const state = { checksum: 0 };
  sharedState.callback = () => readSource();
  const nodes = [];
  const disposers = [];
  let cleanupCalls = 0;

  for (let index = 0; index < count; index += 1) {
    const callback = indexedCallback(variant, readSource, index, sharedState);

    if (kind === "computed") {
      nodes.push(computed(callback));
    } else {
      disposers.push(
        effect(() => {
          state.checksum += callback();
          return () => {
            cleanupCalls += 1;
          };
        }),
      );
    }
  }

  return {
    runtime,
    readSource,
    setSource,
    sharedState,
    state,
    nodes,
    disposers,
    get cleanupCalls() {
      return cleanupCalls;
    },
  };
}

function readComputedGraph(graph) {
  graph.state.checksum = 0;
  for (const read of graph.nodes) graph.state.checksum += read();
  return graph.state.checksum;
}

function executeEffects(graph) {
  graph.state.checksum = 0;
  graph.runtime.flush();
  return graph.state.checksum;
}

function expectedChecksum(variant, count, sourceValue) {
  if (variant === "no-item-capture" || variant === "shared-state") {
    return count * sourceValue;
  }
  return count * sourceValue + (count * (count - 1)) / 2;
}

function measurePropagation(kind, variant, count, trials) {
  const graphs = Array.from({ length: trials }, () => {
    const graph = createGraph(kind, variant, count);
    if (kind === "computed") readComputedGraph(graph);
    graph.setSource(1);
    return graph;
  });
  const elapsed = measureTrials(trials, (trial) => {
    if (kind === "computed") readComputedGraph(graphs[trial]);
    else executeEffects(graphs[trial]);
  });
  return elapsed;
}

function measureDisposal(variant, count, trials) {
  const graphs = Array.from({ length: trials }, () => {
    const graph = createGraph("effects", variant, count);
    graph.setSource(1);
    executeEffects(graph);
    return graph;
  });
  const elapsed = measureTrials(trials, (trial) => {
    for (const dispose of graphs[trial].disposers) dispose();
  });
  return elapsed;
}

function runChild(options) {
  const count = positiveInt(options, "count", DEFAULT_COUNT);
  const trials = positiveInt(options, "trials", DEFAULT_TRIALS);
  const kind = String(options.get("kind"));
  const variant = String(options.get("variant"));
  if (!KINDS.includes(kind) || !VARIANTS.includes(variant)) {
    throw new Error(
      `Use --kind=<${KINDS.join("|")}> and --variant=<${VARIANTS.join("|")}>`,
    );
  }

  fullGc();
  const heapUsedBaselineBytes = process.memoryUsage().heapUsed;
  const creationMs = measureTrials(trials, () => {
    const graph = createGraph(kind, variant, count);
    graph.nodes.length = 0;
    graph.disposers.length = 0;
  });
  const initialMs = measureTrials(trials, () => {
    const graph = createGraph(kind, variant, count);
    if (kind === "computed") readComputedGraph(graph);
    else {
      graph.setSource(1);
      executeEffects(graph);
    }
    graph.nodes.length = 0;
    graph.disposers.length = 0;
  });

  const propagationMs = measurePropagation(kind, variant, count, trials);
  const cleanupMs =
    kind === "effects" ? measureDisposal(variant, count, trials) : null;

  // Each public Runtime owns an execution context. Create the retained graph
  // last so its semantic checks run while its context is active.
  const graph = createGraph(kind, variant, count);
  const initialChecksum =
    kind === "computed" ? readComputedGraph(graph) : graph.state.checksum;
  if (initialChecksum !== expectedChecksum(variant, count, 0)) {
    throw new Error(
      `${variant} initial API checksum mismatch: expected ${expectedChecksum(variant, count, 0)}, got ${initialChecksum}`,
    );
  }

  let nextValue = 1;
  const writeMs = measureTrials(trials, () => {
    graph.setSource(nextValue);
    nextValue += 1;
  });
  const finalSourceValue = nextValue - 1;
  const finalChecksum =
    kind === "computed" ? readComputedGraph(graph) : executeEffects(graph);
  if (finalChecksum !== expectedChecksum(variant, count, finalSourceValue)) {
    throw new Error(
      `${variant} post-mutation API checksum mismatch: expected ${expectedChecksum(variant, count, finalSourceValue)}, got ${finalChecksum}, source=${finalSourceValue}`,
    );
  }

  fullGc();
  const heapUsedRetainedBytes = process.memoryUsage().heapUsed;
  let snapshotPath = null;
  if (options.get("snapshot-dir")) {
    const directory = String(options.get("snapshot-dir"));
    mkdirSync(directory, { recursive: true });
    snapshotPath = writeHeapSnapshot(
      `${directory}/${kind}-${variant}-${count}.heapsnapshot`,
    );
  }

  const publicItems =
    kind === "computed" ? graph.nodes.length : graph.disposers.length;
  for (const dispose of graph.disposers) dispose();
  graph.nodes.length = 0;
  graph.disposers.length = 0;
  fullGc();

  return {
    kind,
    variant,
    count,
    trials,
    phasesMs: {
      creation: creationMs,
      initialComputationOrEffectRun: initialMs,
      mutationWrite: writeMs,
      propagationOrEffectExecution: propagationMs,
      disposalCleanup: cleanupMs,
    },
    heapUsedBaselineBytes,
    heapUsedRetainedBytes,
    retainedGraphBytes: heapUsedRetainedBytes - heapUsedBaselineBytes,
    retainedBytesPerItem: Math.round(
      (heapUsedRetainedBytes - heapUsedBaselineBytes) / count,
    ),
    topology: { publicItems, expectedItems: count },
    semantic: {
      initialChecksum,
      finalChecksum,
      cleanupCalls: graph.cleanupCalls,
    },
    snapshotPath,
  };
}

function runMatrix(options) {
  const count = positiveInt(options, "count", DEFAULT_COUNT);
  const trials = positiveInt(options, "trials", DEFAULT_TRIALS);
  const kinds = options.get("kind") ? [String(options.get("kind"))] : KINDS;
  const variants = options.get("variant")
    ? [String(options.get("variant"))]
    : VARIANTS;
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
      if (options.get("snapshot-dir")) {
        childArgs.push(`--snapshot-dir=${options.get("snapshot-dir")}`);
      }
      const child = spawnSync(process.execPath, childArgs, {
        encoding: "utf8",
      });
      if (child.status !== 0) {
        process.stderr.write(child.stderr);
        throw new Error(`API callback benchmark failed for ${kind}/${variant}`);
      }
      results.push(JSON.parse(child.stdout));
    }
  }

  if (options.has("json")) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    return;
  }

  console.table(
    results.map((result) => ({
      kind: result.kind,
      variant: result.variant,
      items: result.count,
      createMs: result.phasesMs.creation.toFixed(2),
      initialMs: result.phasesMs.initialComputationOrEffectRun.toFixed(2),
      writeMs: result.phasesMs.mutationWrite.toFixed(2),
      executeMs: result.phasesMs.propagationOrEffectExecution.toFixed(2),
      cleanupMs: result.phasesMs.disposalCleanup?.toFixed(2) ?? "n/a",
      retainedKiB: Math.round(result.retainedGraphBytes / 1024),
      bytesPerItem: result.retainedBytesPerItem,
    })),
  );
  console.log("API semantic checksum checks passed for every scenario.");
}

const options = parseArgs(process.argv.slice(2));
if (options.has("child"))
  process.stdout.write(`${JSON.stringify(runChild(options))}\n`);
else runMatrix(options);
