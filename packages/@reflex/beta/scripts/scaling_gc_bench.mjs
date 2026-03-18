import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import path from "node:path";

if (typeof global.gc !== "function") {
  console.error("This script requires --expose-gc.");
  process.exit(1);
}

const args = process.argv.slice(2);

function readArg(flag, fallback) {
  const index = args.indexOf(flag);
  if (index === -1) return fallback;
  return args[index + 1] ?? fallback;
}

function readSizesArg(flag, fallback) {
  const raw = readArg(flag, "");
  if (!raw) return fallback;
  return raw
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
}

const distArg = readArg("--dist", "../dist/esm/index.js");
const label = readArg("--label", path.basename(path.dirname(distArg)));
const scenarioFilter = readArg("--scenario", "all");
const distPath = path.resolve(import.meta.dirname, distArg);

const { createRuntime } = await import(pathToFileURL(distPath).href);

let sink = 0;

function blackhole(value) {
  sink = (sink * 100_019 + (value | 0)) | 0;
}

function formatMs(value) {
  return `${value.toFixed(3)} ms`;
}

function formatUs(value) {
  return `${value.toFixed(3)} us`;
}

function formatMB(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function gcAndMeasure() {
  const start = performance.now();
  global.gc();
  return performance.now() - start;
}

function heapUsed() {
  return process.memoryUsage().heapUsed;
}

function makeRng(seed) {
  let state = seed | 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    return (state >>> 0) / 4294967296;
  };
}

function sampleCount(memoCount) {
  return Math.max(1, Math.ceil(memoCount / 10));
}

function createWideStaticHarness(memoCount, depCount = 5, sourceCount = 32) {
  const runtime = createRuntime();
  const sources = Array.from({ length: sourceCount }, (_, index) =>
    runtime.signal(index),
  );
  const memos = Array.from({ length: memoCount }, (_, memoIndex) =>
    runtime.memo(() => {
      let sum = 0;
      for (let depIndex = 0; depIndex < depCount; depIndex++) {
        sum += sources[(memoIndex + depIndex * 7) % sourceCount].read();
      }
      return sum;
    }),
  );

  for (let i = 0; i < memos.length; i += 10) {
    blackhole(memos[i]());
  }

  const rng = makeRng(0x5a17 + memoCount);

  function step() {
    const sourceIndex = Math.floor(rng() * sourceCount);
    sources[sourceIndex].write(rng() * 1000);
    for (let i = 0; i < memos.length; i += 10) {
      blackhole(memos[i]());
    }
  }

  return {
    step,
    edgeCount: memoCount * depCount,
    sampleReads: sampleCount(memoCount),
  };
}

function createDynamicFlipHarness(
  memoCount,
  depCount = 12,
  sourceCount = 24,
) {
  const runtime = createRuntime();
  const sources = Array.from({ length: sourceCount }, (_, index) =>
    runtime.signal(index),
  );
  const memos = Array.from({ length: memoCount }, (_, memoIndex) =>
    runtime.memo(() => {
      let sum = 0;
      const flip = sources[0].read() & 3;
      for (let depIndex = 0; depIndex < depCount; depIndex++) {
        const sourceIndex =
          (memoIndex * 3 + depIndex + flip * 5) % sourceCount;
        sum += sources[sourceIndex].read();
      }
      return sum;
    }),
  );

  for (let i = 0; i < memos.length; ++i) {
    blackhole(memos[i]());
  }

  const rng = makeRng(0x6d91 + memoCount);

  function step() {
    sources[0].write((rng() * 2048) | 0);
    for (let i = 0; i < memos.length; ++i) {
      blackhole(memos[i]());
    }
  }

  return {
    step,
    edgeCount: memoCount * depCount,
    sampleReads: memoCount,
  };
}

function measureScenario(name, sizes, createHarness) {
  const rows = [];

  for (const memoCount of sizes) {
    gcAndMeasure();
    const heapBeforeBuild = heapUsed();

    const buildStart = performance.now();
    const harness = createHarness(memoCount);
    const buildMs = performance.now() - buildStart;

    const gcAfterBuildMs = gcAndMeasure();
    const retainedAfterBuild = heapUsed() - heapBeforeBuild;

    const iterations = Math.max(
      20,
      Math.min(250, Math.floor(1_600_000 / memoCount)),
    );
    for (let i = 0; i < 25; ++i) {
      harness.step();
    }

    const hotStart = performance.now();
    for (let i = 0; i < iterations; ++i) {
      harness.step();
    }
    const hotTotalMs = performance.now() - hotStart;
    const avgHotMs = hotTotalMs / iterations;
    const avgTouchedUs = (avgHotMs * 1000) / harness.sampleReads;

    const gcAfterHotMs = gcAndMeasure();
    const retainedAfterHot = heapUsed() - heapBeforeBuild;

    rows.push({
      memoCount,
      edgeCount: harness.edgeCount,
      buildMs,
      avgHotMs,
      avgTouchedUs,
      retainedAfterBuild,
      retainedAfterHot,
      gcAfterBuildMs,
      gcAfterHotMs,
    });
  }

  console.log(`\n=== ${name} ===`);
  console.table(
    rows.map((row) => ({
      memos: row.memoCount,
      edges: row.edgeCount,
      build: formatMs(row.buildMs),
      hot_op: formatMs(row.avgHotMs),
      hot_per_read: formatUs(row.avgTouchedUs),
      retained_build: formatMB(row.retainedAfterBuild),
      retained_hot: formatMB(row.retainedAfterHot),
      gc_build: formatMs(row.gcAfterBuildMs),
      gc_hot: formatMs(row.gcAfterHotMs),
    })),
  );

  const first = rows[0];
  const last = rows[rows.length - 1];
  console.log(
    [
      `scale ${first.memoCount} -> ${last.memoCount} memos`,
      `hot_op x${(last.avgHotMs / first.avgHotMs).toFixed(2)}`,
      `retained_build x${(
        last.retainedAfterBuild / Math.max(1, first.retainedAfterBuild)
      ).toFixed(2)}`,
      `gc_hot x${(last.gcAfterHotMs / Math.max(0.001, first.gcAfterHotMs)).toFixed(2)}`,
    ].join(" | "),
  );
}

function measureChurn(name, sizes, createHarness) {
  const rows = [];

  for (const memoCount of sizes) {
    gcAndMeasure();
    const baselineHeap = heapUsed();
    const rounds = memoCount >= 20_000 ? 6 : 10;
    let buildTotalMs = 0;
    let gcTotalMs = 0;
    let maxHeapDelta = 0;

    for (let round = 0; round < rounds; ++round) {
      const buildStart = performance.now();
      let harness = createHarness(memoCount);
      buildTotalMs += performance.now() - buildStart;

      for (let i = 0; i < 8; ++i) {
        harness.step();
      }

      maxHeapDelta = Math.max(maxHeapDelta, heapUsed() - baselineHeap);
      harness = null;
      gcTotalMs += gcAndMeasure();
    }

    const finalHeapDelta = heapUsed() - baselineHeap;

    rows.push({
      memoCount,
      rounds,
      avgBuildMs: buildTotalMs / rounds,
      avgGcMs: gcTotalMs / rounds,
      maxHeapDelta,
      finalHeapDelta,
    });
  }

  console.log(`\n=== ${name} ===`);
  console.table(
    rows.map((row) => ({
      memos: row.memoCount,
      rounds: row.rounds,
      avg_build: formatMs(row.avgBuildMs),
      avg_forced_gc: formatMs(row.avgGcMs),
      peak_heap: formatMB(row.maxHeapDelta),
      final_drift: formatMB(row.finalHeapDelta),
    })),
  );

  const worst = rows.reduce((max, row) => (row.avgGcMs > max.avgGcMs ? row : max));
  console.log(
    `worst forced-gc pause: ${worst.memoCount} memos -> ${formatMs(
      worst.avgGcMs,
    )}, final drift ${formatMB(worst.finalHeapDelta)}`,
  );
}

const wideSizes = readSizesArg("--wide-sizes", [1_000, 5_000, 10_000, 25_000, 50_000]);
const dynamicSizes = readSizesArg("--dynamic-sizes", [300, 1_000, 3_000, 10_000]);

console.log(`beta scaling + forced-gc benchmark [${label}]`);
console.log(`dist ${distPath}`);
console.log(`node ${process.version}`);

if (scenarioFilter === "all" || scenarioFilter === "wide") {
  measureScenario("Wide static graph scaling", wideSizes, (memoCount) =>
    createWideStaticHarness(memoCount),
  );
}

if (scenarioFilter === "all" || scenarioFilter === "dynamic") {
  measureScenario("Dynamic dependency flip scaling", dynamicSizes, (memoCount) =>
    createDynamicFlipHarness(memoCount),
  );
}

if (scenarioFilter === "all" || scenarioFilter === "churn") {
  measureChurn(
    "Wide static graph churn + forced GC",
    [1_000, 10_000, 25_000, 50_000],
    (memoCount) => createWideStaticHarness(memoCount),
  );
}

if (sink === 42) {
  console.log("blackhole", sink);
}
