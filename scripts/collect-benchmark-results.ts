import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { arch, cpus, platform, release, totalmem } from "node:os";

type VitestBenchmark = {
  name: string;
  hz?: number;
  mean?: number;
  median?: number;
  p75?: number;
  p99?: number;
  p995?: number;
  p999?: number;
  min?: number;
  max?: number;
  rme?: number;
  sampleCount?: number;
};

type VitestGroup = {
  fullName: string;
  benchmarks?: VitestBenchmark[];
};

type VitestFile = {
  groups?: VitestGroup[];
};

type VitestBenchReport = {
  files?: VitestFile[];
};

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
  medianMs: number | null;
  p75Ms: number | null;
  p99Ms: number | null;
  p999Ms: number | null;
  minMs: number | null;
  maxMs: number | null;
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
  schemaVersion: 1;
  suite: "runtime-taxonomy";
  generatedAt: string;
  commit: string | null;
  env: {
    node: string;
    v8: string;
    platform: string;
    release: string;
    arch: string;
    cpu: string | null;
    cpuCount: number;
    totalMemoryMb: number;
    ci: boolean;
  };
  benchmarks: NormalizedBenchmark[];
};

const WORK_KEYS = {
  w: "writes",
  sr: "sinkReads",
  pr: "producerReads",
  cr: "consumerReads",
  runs: "computeRuns",
  cand: "recomputeCandidates",
  inv: "invalidated",
  edge: "edgeTraversals",
  sched: "scheduledWatchers",
  flush: "flushes",
  add: "depsAdded",
  drop: "depsDropped",
  wc: "watchersCreated",
  wd: "watchersDisposed",
} as const;

const EMPTY_WORK: BenchWork = {
  writes: 0,
  sinkReads: 0,
  producerReads: 0,
  consumerReads: 0,
  computeRuns: 0,
  recomputeCandidates: 0,
  invalidated: 0,
  edgeTraversals: 0,
  scheduledWatchers: 0,
  flushes: 0,
  depsAdded: 0,
  depsDropped: 0,
  watchersCreated: 0,
  watchersDisposed: 0,
};

function parseArgs(): {
  raw: string;
  out: string;
  skipRun: boolean;
} {
  const args = process.argv.slice(2);
  let raw = "bench-results/runtime/latest.raw.json";
  let out = "bench-results/runtime/latest.json";
  let skipRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--") {
      continue;
    } else if (arg === "--raw") {
      raw = args[++index] ?? raw;
    } else if (arg === "--out") {
      out = args[++index] ?? out;
    } else if (arg === "--skip-run") {
      skipRun = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { raw, out, skipRun };
}

function runBench(rawPath: string): void {
  mkdirSync(dirname(rawPath), { recursive: true });

  const benchArgs = [
    "--filter",
    "@volynets/reflex-runtime",
    "exec",
    "vitest",
    "bench",
    "test/perf/runtime-taxonomy.bench.ts",
    "--outputJson",
    rawPath,
  ];
  const command = process.platform === "win32" ? "cmd.exe" : "pnpm";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "pnpm.cmd", ...benchArgs]
      : benchArgs;

  const result = spawnSync(command, args, {
    shell: false,
    stdio: "inherit",
  });

  if (result.error !== undefined) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Benchmark command failed with status ${result.status}`);
  }
}

function getCommit(): string | null {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  });

  return result.status === 0 ? result.stdout.trim() : null;
}

function parsePressureAndLabel(fullName: string): {
  pressure: string;
  label: string;
} {
  const marker = "runtime taxonomy | ";
  const start = fullName.indexOf(marker);
  const rest = start === -1 ? fullName : fullName.slice(start + marker.length);
  const [pressure = "unknown", ...labelParts] = rest.split(" | ");

  return {
    pressure,
    label: labelParts.join(" | ") || rest,
  };
}

function parseWork(name: string): BenchWork {
  const work = { ...EMPTY_WORK };
  const text = name.replace(/^measure\s+\|\s+/, "");

  if (text === "empty") return work;

  for (const token of text.split(/\s+/)) {
    const [key, rawValue] = token.split("=");
    if (!key || rawValue === undefined) continue;

    const target = WORK_KEYS[key as keyof typeof WORK_KEYS];
    if (target === undefined) continue;

    work[target] = Number(rawValue);
  }

  return work;
}

function perUnit(meanMs: number, count: number): number | null {
  return count > 0 ? (meanMs * 1000) / count : null;
}

function normalizeBenchmark(
  group: VitestGroup,
  benchmark: VitestBenchmark,
): NormalizedBenchmark {
  const { pressure, label } = parsePressureAndLabel(group.fullName);
  const work = parseWork(benchmark.name);
  const meanMs = benchmark.mean ?? 0;
  const depChurn = work.depsAdded + work.depsDropped;

  return {
    id: label,
    pressure,
    label,
    meanMs,
    medianMs: benchmark.median ?? null,
    p75Ms: benchmark.p75 ?? null,
    p99Ms: benchmark.p99 ?? null,
    p999Ms: benchmark.p999 ?? null,
    minMs: benchmark.min ?? null,
    maxMs: benchmark.max ?? null,
    hz: benchmark.hz ?? null,
    rme: benchmark.rme ?? null,
    samples: benchmark.sampleCount ?? null,
    work,
    derived: {
      meanUsPerEdge: perUnit(meanMs, work.edgeTraversals),
      meanUsPerRun: perUnit(meanMs, work.computeRuns),
      meanUsPerRecomputeCandidate: perUnit(meanMs, work.recomputeCandidates),
      meanUsPerInvalidation: perUnit(meanMs, work.invalidated),
      meanUsPerDepChurn: perUnit(meanMs, depChurn),
    },
  };
}

function normalize(rawPath: string): NormalizedReport {
  const report = JSON.parse(readFileSync(rawPath, "utf8")) as VitestBenchReport;
  const benchmarks: NormalizedBenchmark[] = [];

  for (const file of report.files ?? []) {
    for (const group of file.groups ?? []) {
      for (const benchmark of group.benchmarks ?? []) {
        if (benchmark.mean === undefined || benchmark.hz === undefined) {
          console.warn(
            `Skipping incomplete benchmark result: ${group.fullName}`,
          );
          continue;
        }

        benchmarks.push(normalizeBenchmark(group, benchmark));
      }
    }
  }

  return {
    schemaVersion: 1,
    suite: "runtime-taxonomy",
    generatedAt: new Date().toISOString(),
    commit: getCommit(),
    env: {
      node: process.version,
      v8: process.versions.v8,
      platform: platform(),
      release: release(),
      arch: arch(),
      cpu: cpus()[0]?.model ?? null,
      cpuCount: cpus().length,
      totalMemoryMb: Math.round(totalmem() / 1024 / 1024),
      ci: process.env.CI === "true",
    },
    benchmarks,
  };
}

function main(): void {
  const { raw, out, skipRun } = parseArgs();
  const rawPath = resolve(raw);
  const outPath = resolve(out);

  if (!skipRun) runBench(rawPath);

  const normalized = normalize(rawPath);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(normalized, null, 2)}\n`);

  console.log(
    `Normalized ${normalized.benchmarks.length} runtime benchmarks -> ${out}`,
  );
}

main();
