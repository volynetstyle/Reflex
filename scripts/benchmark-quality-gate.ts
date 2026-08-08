import { cpus, arch, platform, release } from "node:os";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

type RawBenchmark = {
  name: string;
  mean: number;
  rme: number;
  sampleCount: number;
};
type RawGroup = { fullName: string; benchmarks: RawBenchmark[] };
type RawReport = { files: Array<{ groups: RawGroup[] }> };
type MeasurementStatus = "valid" | "unstable" | "insufficient-samples";
type PerformanceStatus =
  | "ok"
  | "improvement"
  | "regression"
  | "suspicious-shift";

type Result = {
  id: string;
  base: { medianMeanMs: number; meansMs: number[] };
  head: { medianMeanMs: number; meansMs: number[] };
  comparison: {
    ratio: number;
    delta: number;
    medianLogRatio: number;
    logRatioMad: number;
    pairedRatios: number[];
  };
  measurement: {
    status: MeasurementStatus;
    replicates: number;
    maxRme: number;
    minSamples: number;
    issues: string[];
  };
  performance: { status: PerformanceStatus; reasons: string[] };
};

function value(flag: string): string {
  const index = process.argv.indexOf(flag);
  const result = index === -1 ? undefined : process.argv[index + 1];
  if (!result) throw new Error(`Missing required argument ${flag}`);
  return result;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validateReport(
  value: unknown,
  path: string,
): asserts value is RawReport {
  const fail = (message: string): never => {
    throw new Error(
      `Invalid Vitest 4 benchmark JSON schema in ${path}: ${message}. ` +
        "Expected files[].groups[].benchmarks[] with mean, rme and sampleCount numbers. " +
        "Vitest 5 output is incompatible with this protocol.",
    );
  };
  if (typeof value !== "object" || value === null)
    fail("report is not an object");
  const files = (value as { files?: unknown }).files;
  if (!Array.isArray(files) || files.length === 0)
    fail("files is missing or empty");
  for (const [fileIndex, file] of files.entries()) {
    const groups = (file as { groups?: unknown })?.groups;
    if (!Array.isArray(groups) || groups.length === 0)
      fail(`files[${fileIndex}].groups is missing or empty`);
    for (const [groupIndex, group] of groups.entries()) {
      if (typeof (group as RawGroup)?.fullName !== "string")
        fail(`group ${groupIndex} has no fullName`);
      const benchmarks = (group as { benchmarks?: unknown }).benchmarks;
      if (!Array.isArray(benchmarks) || benchmarks.length === 0)
        fail(`group ${groupIndex} has no benchmarks`);
      for (const [benchmarkIndex, benchmark] of benchmarks.entries()) {
        const item = benchmark as Partial<RawBenchmark>;
        const location = `files[${fileIndex}].groups[${groupIndex}].benchmarks[${benchmarkIndex}]`;
        if (typeof item.name !== "string")
          fail(`${location}.name is not a string`);
        if (!finite(item.mean) || item.mean <= 0)
          fail(`${location}.mean is not a positive number`);
        if (!finite(item.rme) || item.rme < 0)
          fail(`${location}.rme is not a non-negative number`);
        if (!finite(item.sampleCount) || item.sampleCount <= 0)
          fail(`${location}.sampleCount is not positive`);
      }
    }
  }
}

function flatten(path: string): Map<string, RawBenchmark> {
  const report: unknown = JSON.parse(readFileSync(path, "utf8"));
  validateReport(report, path);
  const benchmarks = new Map<string, RawBenchmark>();
  for (const file of report.files) {
    for (const group of file.groups) {
      for (const benchmark of group.benchmarks) {
        const id = `${group.fullName} > ${benchmark.name}`;
        if (benchmarks.has(id))
          throw new Error(`Duplicate benchmark id in ${path}: ${id}`);
        benchmarks.set(id, benchmark);
      }
    }
  }
  return benchmarks;
}

function median(numbers: number[]): number {
  const sorted = [...numbers].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function percent(number: number): string {
  const sign = number > 0 ? "+" : "";
  return `${sign}${(number * 100).toFixed(1)}%`;
}

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sameIds(reports: Map<string, RawBenchmark>[], label: string): void {
  const expected = [...reports[0]!.keys()].sort();
  for (const [index, report] of reports.slice(1).entries()) {
    const actual = [...report.keys()].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        `${label} replicate ${index + 2} contains a different benchmark set`,
      );
    }
  }
}

function createChart(
  suite: string,
  baseCommit: string,
  headCommit: string,
  threshold: number,
  anomalyThreshold: number,
  results: Result[],
): string {
  const width = 1280;
  const labelWidth = 540;
  const plotWidth = width - labelWidth - 80;
  const rowHeight = 29;
  const top = 98;
  const height = top + results.length * rowHeight + 50;
  const bound = Math.max(anomalyThreshold, threshold, 0.5);
  const x = (delta: number) =>
    labelWidth +
    plotWidth / 2 +
    (Math.max(-bound, Math.min(bound, delta)) / bound) * (plotWidth / 2);
  const line = (delta: number, color: string, dash = "") =>
    `<line x1="${x(delta)}" y1="70" x2="${x(delta)}" y2="${height - 28}" stroke="${color}" ${dash ? `stroke-dasharray="${dash}"` : ""}/>`;
  const rows = results
    .map((result, index) => {
      const y = top + index * rowHeight;
      const end = x(result.comparison.delta);
      const color =
        result.measurement.status !== "valid"
          ? "#bf8700"
          : result.performance.status === "regression" ||
              result.performance.status === "suspicious-shift"
            ? "#d1242f"
            : result.performance.status === "improvement"
              ? "#1a7f37"
              : "#57606a";
      const marker =
        result.measurement.status === "unstable"
          ? `<rect x="${end - 5}" y="${y - 5}" width="10" height="10" transform="rotate(45 ${end} ${y})" fill="${color}"/>`
          : result.measurement.status === "insufficient-samples"
            ? `<path d="M ${end - 5} ${y - 5} L ${end + 5} ${y + 5} M ${end + 5} ${y - 5} L ${end - 5} ${y + 5}" stroke="${color}" stroke-width="3"/>`
            : `<circle cx="${end}" cy="${y}" r="5" fill="${color}"/>`;
      const label =
        result.id.length > 69 ? `…${result.id.slice(-68)}` : result.id;
      return `<text x="12" y="${y + 4}" class="label">${escapeXml(label)}</text><line x1="${x(0)}" y1="${y}" x2="${end}" y2="${y}" stroke="${color}" stroke-width="7"/>${marker}<text x="${end + (result.comparison.delta >= 0 ? 9 : -9)}" y="${y + 4}" text-anchor="${result.comparison.delta >= 0 ? "start" : "end"}" class="delta" fill="${color}">${percent(result.comparison.delta)}</text>`;
    })
    .join("");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<rect width="100%" height="100%" fill="#fff"/><style>.title{font:600 20px system-ui}.meta,.axis{font:12px system-ui;fill:#57606a}.label{font:11px ui-monospace,monospace;fill:#24292f}.delta{font:600 11px system-ui}</style>',
    `<text x="12" y="28" class="title">${escapeXml(suite)} paired benchmark delta</text>`,
    `<text x="12" y="50" class="meta">${escapeXml(baseCommit.slice(0, 12))} → ${escapeXml(headCommit.slice(0, 12))} · ● valid · ◆ unstable · × insufficient samples</text>`,
    line(-anomalyThreshold, "#bf8700", "3 4"),
    line(0, "#57606a"),
    line(threshold, "#d1242f", "5 4"),
    line(anomalyThreshold, "#bf8700", "3 4"),
    `<text x="${x(-anomalyThreshold)}" y="${height - 9}" text-anchor="middle" class="axis">${percent(-anomalyThreshold)}</text><text x="${x(0)}" y="${height - 9}" text-anchor="middle" class="axis">0%</text><text x="${x(threshold)}" y="${height - 9}" text-anchor="middle" class="axis">gate ${percent(threshold)}</text><text x="${x(anomalyThreshold)}" y="${height - 9}" text-anchor="middle" class="axis">${percent(anomalyThreshold)}</text>`,
    rows,
    "</svg>",
  ].join("");
}

const suite = value("--suite");
const baseCommit = value("--base-commit");
const headCommit = value("--head-commit");
const commitTimestamp = value("--head-timestamp");
const workflowRunId = value("--workflow-run-id");
const scope = value("--scope");
const protocolHash = value("--protocol-hash");
const vitestVersion = value("--vitest-version");
const pnpmVersion = value("--pnpm-version");
const basePaths = value("--base-files").split(",");
const headPaths = value("--head-files").split(",");
const jsonPath = value("--json");
const markdownPath = value("--markdown");
const chartPath = value("--chart");
const threshold = Number(value("--threshold"));
const anomalyThreshold = Number(value("--anomaly-threshold"));
const maxRme = Number(value("--max-rme"));
const maxLogRatioMad = Number(value("--max-log-ratio-mad"));
const minSamples = Number(value("--min-samples"));

if (!/^vitest\/4\./.test(vitestVersion)) {
  throw new Error(
    `Unsupported benchmark provider version: ${vitestVersion}; this protocol requires Vitest 4.x`,
  );
}
if (basePaths.length !== headPaths.length || basePaths.length < 2) {
  throw new Error(
    "Paired benchmark protocol requires at least two base/head replicates",
  );
}

const baseReports = basePaths.map(flatten);
const headReports = headPaths.map(flatten);
sameIds(baseReports, "base");
sameIds(headReports, "head");
const baseIds = [...baseReports[0]!.keys()].sort();
const headIds = [...headReports[0]!.keys()].sort();
if (JSON.stringify(baseIds) !== JSON.stringify(headIds)) {
  throw new Error(
    "Base and head contain different benchmark sets; benchmark protocol must remain fixed",
  );
}

const results: Result[] = baseIds.map((id) => {
  const baseItems = baseReports.map((report) => report.get(id)!);
  const headItems = headReports.map((report) => report.get(id)!);
  const baseMeans = baseItems.map((item) => item.mean);
  const headMeans = headItems.map((item) => item.mean);
  const logRatios = headMeans.map((mean, index) =>
    Math.log(mean / baseMeans[index]!),
  );
  const medianLogRatio = median(logRatios);
  const logRatioMad = median(
    logRatios.map((number) => Math.abs(number - medianLogRatio)),
  );
  const ratio = Math.exp(medianLogRatio);
  const delta = ratio - 1;
  const maxObservedRme =
    Math.max(
      ...baseItems.map((item) => item.rme),
      ...headItems.map((item) => item.rme),
    ) / 100;
  const minObservedSamples = Math.min(
    ...baseItems.map((item) => item.sampleCount),
    ...headItems.map((item) => item.sampleCount),
  );
  const measurementIssues: string[] = [];
  if (maxObservedRme > maxRme)
    measurementIssues.push(
      `within-run RME ${percent(maxObservedRme)} exceeds ${percent(maxRme)}`,
    );
  if (logRatioMad > maxLogRatioMad)
    measurementIssues.push(
      `paired log-ratio MAD ${logRatioMad.toFixed(4)} exceeds ${maxLogRatioMad.toFixed(4)}`,
    );
  if (minObservedSamples < minSamples)
    measurementIssues.push(
      `only ${minObservedSamples} samples; minimum is ${minSamples}`,
    );
  const measurementStatus: MeasurementStatus =
    minObservedSamples < minSamples
      ? "insufficient-samples"
      : maxObservedRme > maxRme || logRatioMad > maxLogRatioMad
        ? "unstable"
        : "valid";
  const performanceReasons: string[] = [];
  let performanceStatus: PerformanceStatus = "ok";
  if (delta > threshold) {
    performanceStatus = "regression";
    performanceReasons.push(
      `paired median regression exceeds ${percent(threshold)} budget`,
    );
  } else if (delta < -anomalyThreshold) {
    performanceStatus = "suspicious-shift";
    performanceReasons.push(
      `unexpected speedup exceeds ${percent(-anomalyThreshold)}`,
    );
  } else if (delta < -threshold) {
    performanceStatus = "improvement";
    performanceReasons.push(
      `paired median improvement exceeds ${percent(-threshold)}`,
    );
  }
  return {
    id,
    base: { medianMeanMs: median(baseMeans), meansMs: baseMeans },
    head: { medianMeanMs: median(headMeans), meansMs: headMeans },
    comparison: {
      ratio,
      delta,
      medianLogRatio,
      logRatioMad,
      pairedRatios: logRatios.map(Math.exp),
    },
    measurement: {
      status: measurementStatus,
      replicates: basePaths.length,
      maxRme: maxObservedRme,
      minSamples: minObservedSamples,
      issues: measurementIssues,
    },
    performance: { status: performanceStatus, reasons: performanceReasons },
  };
});

results.sort((left, right) => right.comparison.delta - left.comparison.delta);
const regressions = results.filter(
  (result) => result.performance.status === "regression",
);
const suspicious = results.filter(
  (result) => result.performance.status === "suspicious-shift",
);
const invalidMeasurements = results.filter(
  (result) => result.measurement.status !== "valid",
);
const passed =
  regressions.length === 0 &&
  suspicious.length === 0 &&
  invalidMeasurements.length === 0;
const measuredAt = new Date().toISOString();
const summary = {
  schemaVersion: 3,
  benchmarkProvider: "vitest",
  rawSchemaVersion: 4,
  vitestVersion,
  suite,
  protocolHash,
  scope,
  workflowRunId,
  measuredAt,
  commitTimestamp,
  commits: { base: baseCommit, head: headCommit },
  environment: {
    node: process.version,
    v8: process.versions.v8,
    pnpm: pnpmVersion,
    vitest: vitestVersion,
    platform: platform(),
    release: release(),
    arch: arch(),
    cpu: cpus()[0]?.model ?? "unknown",
    cpuCount: cpus().length,
    runnerImage: process.env.ImageOS ?? "unknown",
    runnerImageVersion: process.env.ImageVersion ?? "unknown",
  },
  protocol: { order: "B1 H1 H2 B2", replicates: basePaths.length },
  thresholds: {
    regression: threshold,
    suspiciousShift: anomalyThreshold,
    maxRme,
    maxLogRatioMad,
    minSamples,
  },
  passed,
  counts: {
    benchmarks: results.length,
    regressions: regressions.length,
    suspicious: suspicious.length,
    invalidMeasurements: invalidMeasurements.length,
  },
  benchmarks: results,
};

const lines = [
  `# Benchmark quality gate: ${suite}`,
  "",
  `Commits: \`${baseCommit.slice(0, 12)}\` → \`${headCommit.slice(0, 12)}\` · protocol \`${protocolHash.slice(0, 12)}\``,
  "",
  `Result: **${passed ? "PASS" : "FAIL"}** — ${regressions.length} regressions, ${suspicious.length} suspicious shifts, ${invalidMeasurements.length} invalid measurements`,
  "",
  "ABBA order (`B1 H1 H2 B2`); performance uses median paired log-ratio; measurement quality is evaluated independently.",
  "",
  "| Performance | Measurement | Benchmark | Base median | Head median | Delta | Diagnostics |",
  "| --- | --- | --- | ---: | ---: | ---: | --- |",
  ...results.map((result) => {
    const reasons = [
      ...result.performance.reasons,
      ...result.measurement.issues,
    ].join("; ");
    return `| ${result.performance.status} | ${result.measurement.status} | ${result.id.replaceAll("|", "\\|")} | ${result.base.medianMeanMs.toFixed(6)} ms | ${result.head.medianMeanMs.toFixed(6)} ms | ${percent(result.comparison.delta)} | ${reasons.replaceAll("|", "\\|")} |`;
  }),
];

for (const path of [jsonPath, markdownPath, chartPath])
  mkdirSync(dirname(path), { recursive: true });
writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
writeFileSync(markdownPath, `${lines.join("\n")}\n`);
writeFileSync(
  chartPath,
  createChart(
    suite,
    baseCommit,
    headCommit,
    threshold,
    anomalyThreshold,
    results,
  ),
);
console.log(lines.join("\n"));
if (!passed) process.exitCode = 1;
