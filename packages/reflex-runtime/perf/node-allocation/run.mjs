import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import {
  createConsumer,
  createProducer,
  createWatcher,
  readConsumer,
  readProducer,
  runWatcher,
} from "../../dist/perf.js";

const script = fileURLToPath(import.meta.url);
const fixtures = [
  "producer",
  "consumer-shared",
  "consumer-closure",
  "consumer-edges-1",
  "consumer-edges-4",
  "consumer-edges-16",
  "watcher-shared",
  "watcher-cleanup",
  "watcher-scheduled",
];

function argument(name, fallback) {
  const value = process.argv.find((item) => item.startsWith(`--${name}=`));
  return value === undefined ? fallback : value.slice(name.length + 3);
}

function positiveInteger(name, fallback) {
  const value = Number(argument(name, fallback));
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return value;
}

function fullGc() {
  if (typeof globalThis.gc !== "function") {
    throw new Error("Run with --expose-gc");
  }
  for (let index = 0; index < 4; index++) globalThis.gc();
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function runChild(kind, count) {
  const edgeCount = kind.startsWith("consumer-edges-")
    ? Number(kind.slice("consumer-edges-".length))
    : 0;
  const sources = Array.from({ length: edgeCount }, (_, index) =>
    createProducer(index),
  );
  const sharedConsumer = () => {
    let value = 0;
    for (const source of sources) value += readProducer(source);
    return value;
  };
  const sharedWatcher = () => undefined;
  const sharedCleanup = () => undefined;
  const sharedWatcherWithCleanup = () => sharedCleanup;

  fullGc();
  const baseline = process.memoryUsage().heapUsed;
  const start = performance.now();
  const nodes = Array.from({ length: count }, (_, index) => {
    switch (kind) {
      case "producer":
        return createProducer(index);
      case "consumer-shared":
      case "consumer-edges-1":
      case "consumer-edges-4":
      case "consumer-edges-16":
        return createConsumer(sharedConsumer);
      case "consumer-closure":
        return createConsumer(() => index);
      case "watcher-shared":
      case "watcher-scheduled":
        return createWatcher(sharedWatcher);
      case "watcher-cleanup":
        return createWatcher(sharedWatcherWithCleanup);
      default:
        throw new Error(`Unknown fixture: ${kind}`);
    }
  });
  const creationMs = performance.now() - start;
  globalThis.__retainedNodes = nodes;
  fullGc();
  const afterCreation = process.memoryUsage().heapUsed;

  let attachMs = 0;
  if (edgeCount > 0) {
    const attachStart = performance.now();
    for (const node of nodes) readConsumer(node);
    attachMs = performance.now() - attachStart;
  } else if (kind === "watcher-cleanup") {
    for (const node of nodes) runWatcher(node);
  } else if (kind === "watcher-scheduled") {
    // Scheduled is an existing state bit (1 << 5), not a side allocation.
    for (const node of nodes) node.state |= 1 << 5;
  }
  fullGc();
  const afterAttachment = process.memoryUsage().heapUsed;

  return {
    kind,
    count,
    edgeCount,
    createdBytesPerNode: (afterCreation - baseline) / count,
    attachedBytesPerNode: (afterAttachment - afterCreation) / count,
    attachedBytesPerEdge:
      edgeCount > 0
        ? (afterAttachment - afterCreation) / (count * edgeCount)
        : null,
    creationNsPerNode: (creationMs * 1e6) / count,
    attachmentNsPerNode: (attachMs * 1e6) / count,
  };
}

if (process.argv.includes("--child")) {
  process.stdout.write(
    `${JSON.stringify(runChild(argument("fixture", "producer"), positiveInteger("count", 30000)))}\n`,
  );
} else {
  const count = positiveInteger("count", 30000);
  const trials = positiveInteger("trials", 5);
  const selected = argument("fixture", "all");
  const selectedFixtures = selected === "all" ? fixtures : [selected];
  for (const kind of selectedFixtures) {
    if (!fixtures.includes(kind)) throw new Error(`Unknown fixture: ${kind}`);
    const samples = Array.from({ length: trials }, () => {
      const child = spawnSync(
        process.execPath,
        [
          "--expose-gc",
          script,
          "--child",
          `--fixture=${kind}`,
          `--count=${count}`,
        ],
        { encoding: "utf8" },
      );
      if (child.status !== 0)
        throw new Error(child.stderr || `Child failed: ${kind}`);
      return JSON.parse(child.stdout);
    });
    const metrics = [
      "createdBytesPerNode",
      "attachedBytesPerNode",
      "attachedBytesPerEdge",
      "creationNsPerNode",
      "attachmentNsPerNode",
    ];
    const summary = Object.fromEntries(
      metrics.map((metric) => [
        metric,
        median(
          samples
            .map((sample) => sample[metric])
            .filter((value) => value !== null),
        ),
      ]),
    );
    process.stdout.write(
      `${JSON.stringify({ kind, count, trials, ...summary })}\n`,
    );
  }
}
