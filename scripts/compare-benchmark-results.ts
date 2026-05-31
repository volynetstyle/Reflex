import { readFileSync } from "node:fs";

type BenchWork = {
  writes: number;
  sinkReads: number;
  producerReads: number;
  consumerReads: number;
  computeRuns: number;
  recomputeCandidates: number;
  invalidated: number;
  edgeTraversals: number;
  scheduledWatchers: number;
  flushes: number;
  depsAdded: number;
  depsDropped: number;
  watchersCreated: number;
  watchersDisposed: number;
};

type NormalizedBenchmark = {
  id: string;
  pressure: string;
  label: string;
  meanMs: number;
  p99Ms: number | null;
  p999Ms: number | null;
  hz: number | null;
  rme: number | null;
  samples: number | null;
  work: BenchWork;
  derived: {
    meanUsPerEdge: number | null;
    meanUsPerRun: number | null;
    meanUsPerRecomputeCandidate: number | null;
    meanUsPerInvalidation: number | null;
    meanUsPerDepChurn: number | null;
  };
};

type NormalizedReport = {
  suite: string;
  commit: string | null;
  env: {
    platform: string;
    release: string;
    arch: string;
    node: string;
    cpu: string | null;
  };
  benchmarks: NormalizedBenchmark[];
};

type CompareOptions = {
  base: string;
  head: string;
  fail: boolean;
  threshold: number;
};

const STABLE_SCENARIOS = new Set([
  "linear/write-read-tail/depth-1000",
  "wide-fanout/write-read-all/fanout-1024",
  "selector/update-one-key/entities-4096-active1",
  "effect-leaves/effect-flush/watchers-1024",
]);

function parseArgs(): CompareOptions {
  const args = process.argv.slice(2);
  let base = "bench-results/runtime/main-latest.json";
  let head = "bench-results/runtime/latest.json";
  let fail = false;
  let threshold = 0.1;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--") {
      continue;
    } else if (arg === "--base") {
      base = args[++index] ?? base;
    } else if (arg === "--head") {
      head = args[++index] ?? head;
    } else if (arg === "--fail") {
      fail = true;
    } else if (arg === "--threshold") {
      threshold = Number(args[++index] ?? threshold);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { base, head, fail, threshold };
}

function readReport(path: string): NormalizedReport | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as NormalizedReport;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function pct(next: number, prev: number): number {
  return prev === 0 ? 0 : (next - prev) / prev;
}

function formatMs(value: number | null): string {
  return value === null ? "n/a" : `${value.toFixed(4)}ms`;
}

function formatPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(1)}%`;
}

function sameWork(a: BenchWork, b: BenchWork): boolean {
  const keys = Object.keys(a) as Array<keyof BenchWork>;
  return keys.every((key) => a[key] === b[key]);
}

function diagnose(
  base: NormalizedBenchmark,
  head: NormalizedBenchmark,
): string {
  if (!sameWork(base.work, head.work)) {
    if (head.work.edgeTraversals > base.work.edgeTraversals) {
      return "likely: graph work increased, check selectivity/tracking";
    }

    return "likely: scenario work changed, compare topology before timing";
  }

  return "likely: operation cost regression or runtime noise";
}

function printEnvironmentWarning(
  base: NormalizedReport,
  head: NormalizedReport,
): void {
  const sameEnvironment =
    base.env.platform === head.env.platform &&
    base.env.arch === head.env.arch &&
    base.env.node === head.env.node;

  if (!sameEnvironment) {
    console.log(
      [
        "WARNING environment differs; do not treat timing deltas as strict regressions.",
        `base: ${base.env.platform}/${base.env.arch} ${base.env.node}`,
        `head: ${head.env.platform}/${head.env.arch} ${head.env.node}`,
      ].join("\n"),
    );
  }
}

function indexById(report: NormalizedReport): Map<string, NormalizedBenchmark> {
  return new Map(
    report.benchmarks.map((benchmark) => [benchmark.id, benchmark]),
  );
}

function compare(options: CompareOptions): number {
  const base = readReport(options.base);
  const head = readReport(options.head);

  if (head === null) {
    throw new Error(`Head benchmark report not found: ${options.head}`);
  }

  if (base === null) {
    console.log(
      `No baseline benchmark report found at ${options.base}; writing summary only.`,
    );
    for (const benchmark of head.benchmarks) {
      console.log(
        `${benchmark.id}: mean=${formatMs(benchmark.meanMs)} p99=${formatMs(
          benchmark.p99Ms,
        )} edge/op=${benchmark.work.edgeTraversals} runs/op=${
          benchmark.work.computeRuns
        }`,
      );
    }
    return 0;
  }

  printEnvironmentWarning(base, head);

  const baseById = indexById(base);
  let failures = 0;

  for (const next of head.benchmarks) {
    const prev = baseById.get(next.id);
    if (prev === undefined) {
      console.log(`NEW ${next.id}: mean=${formatMs(next.meanMs)}`);
      continue;
    }

    const meanDelta = pct(next.meanMs, prev.meanMs);
    const p99Delta =
      prev.p99Ms !== null && next.p99Ms !== null
        ? pct(next.p99Ms, prev.p99Ms)
        : 0;
    const isRegression =
      meanDelta > options.threshold || p99Delta > options.threshold;
    const prefix = isRegression ? "REGRESSION" : "OK";

    console.log(
      [
        `${prefix} ${next.id}`,
        `  mean: ${formatMs(prev.meanMs)} -> ${formatMs(next.meanMs)} (${formatPct(
          meanDelta,
        )})`,
        `  p99:  ${formatMs(prev.p99Ms)} -> ${formatMs(next.p99Ms)} (${formatPct(
          p99Delta,
        )})`,
        `  work: edge/op ${prev.work.edgeTraversals} -> ${next.work.edgeTraversals}, runs/op ${prev.work.computeRuns} -> ${next.work.computeRuns}, deps ${prev.work.depsAdded + prev.work.depsDropped} -> ${next.work.depsAdded + next.work.depsDropped}`,
        `  ${diagnose(prev, next)}`,
      ].join("\n"),
    );

    if (isRegression && STABLE_SCENARIOS.has(next.id)) {
      failures += 1;
    }
  }

  if (failures > 0) {
    console.log(`Stable runtime benchmark regressions: ${failures}`);
    return options.fail ? 1 : 0;
  }

  return 0;
}

function main(): void {
  process.exitCode = compare(parseArgs());
}

main();
